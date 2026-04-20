"""Cross-ticker orchestrator for the pure-Python equity backtester.

Wraps the single-ticker ``run_backtest`` in
``execution.equity_backtester`` with per-ticker state plus a global
``max_open_positions`` cap, emitting a single ``BacktestResult``
that aggregates trades, skipped signals, and one equity curve
across the whole universe.

────────────────────────────── relationship ─────────────────────

``equity_backtester.run_backtest`` is unchanged by this module. It
remains the canonical single-ticker implementation and is still
called directly when the universe is exactly one ticker. The
orchestrator here re-uses every primitive from the backtester
(evaluators, helpers, lifecycle, state types) — nothing is
duplicated, nothing is shadowed.

Design rationale: the single-ticker loop body mutates only state
that belongs to one ticker, which means a naive per-ticker loop
already handles 90% of multi-ticker backtesting correctly. The
remaining 10% is (1) enforcing the global ``max_open_positions``
cap across tickers, (2) iterating over the UNION of per-ticker
date ranges so tickers that trade on different calendars still
coexist cleanly, and (3) computing one aggregate equity curve
from the per-ticker cash + positions-value contributions. This
module is ~100% about those three concerns.

────────────────────────────── max_open_positions ───────────────

``max_open_positions`` is a GLOBAL cap on the number of
simultaneous open positions across the entire universe, NOT a
per-ticker cap. The single-ticker backtester already enforces
"one position per ticker at a time" via its
``same_ticker_already_open`` skip; the orchestrator additionally
enforces the cross-ticker cap by skipping new signals when the
open count is at the ceiling.

When the cap is hit, a ``SkippedSignalRecord`` with reason
``"max_open_positions"`` is emitted for the rejected signal. The
signal is NOT queued as pending — the cap takes precedence over
the wait-for-fill window. Rationale: queueing it would mean the
orchestrator has to track a separate "blocked pending" state
that competes with natural pendings for the first-available
slot, which gets tangled fast and isn't what backtest users
typically expect. Fire-and-forget is the simpler semantic.

────────────────────────────── same-bar tie-breaking ───────────

When multiple tickers have signals on the same date and the
remaining global slots are fewer than the signals, a tie-breaker
decides which tickers open and which get the
``"max_open_positions"`` skip. The tie-breaker callable is added
in 3b-i-B; the default documented there is alphabetical by
ticker for determinism, with strategic ordering (e.g. pick the
setup furthest from its trigger) reserved as a future hook on
the orchestrator's public signature.

────────────────────────────── aggregate equity ────────────────

One ``EquityPoint`` per date in the union of per-ticker date
ranges. The point's fields are:

  cash             = initial_capital + realized_pnl + sum over
                     every open position of
                     ``_open_position_net_cash_impact``
  positions_value  = sum over every open position of
                     ``held_shares * last_observed_close``
                     where last_observed_close is the most recent
                     bar's close for that ticker on or before
                     this date (handles tickers with sparse /
                     mismatched date ranges)
  equity           = cash + positions_value

Mark-to-market uses the close of each ticker's own bar on (or
before) the iteration date, not a cross-sectional snapshot.

────────────────────────────── scope boundary ──────────────────

This module does CROSS-TICKER ORCHESTRATION ONLY. It does not:

  * Know anything about freqtrade — the freqtrade-era adapter at
    execution/freqtrade_adapter.py is a separate, soon-to-be-
    removed module.
  * Resolve the universe from a UniverseSpec — the caller does
    that upstream (typically ``simulate.py::run_simulation``)
    and passes a concrete list of ticker symbols plus the
    matching price frames.
  * Cache, fetch, or validate price data — the price frames are
    passed in ready-to-iterate, same shape every single-ticker
    ``run_backtest`` call expects.

Wiring into the production ``simulate.py::run_simulation``
entrypoint happens in 3b-ii, which is a separate commit. After
3b-ii, the freqtrade adapter is removed in 3b-iii.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Callable, Optional

import pandas as pd

from simualpha_quant.execution.equity_backtester import (
    Bar,
    BacktestResult,
    BarDecision,
    EntryContext,
    EquityPoint,
    PositionState,
    ResolvedRule,
    _PendingSignal,
    _bar_is_sane,
    _build_resolve_context,
    _build_signal_set,
    _cap_exit_fill_shares,
    _close_and_emit_trade,
    _date_to_index_map,
    _detect_pivots_cached,
    _open_position,
    _open_position_net_cash_impact,
    _planned_capital_for,
    _resolve_stop,
    _resolve_tp_legs,
    _resolve_tranche_ladder,
    _row_to_bar,
    _trade_realized_pnl_dollars,
    _try_tranche_1_fill_pending,
    apply_fee,
    evaluate_entry,
    evaluate_stop,
    evaluate_time_stop,
    evaluate_tp_legs,
    evaluate_tranche,
    resolve_same_bar_conflict,
    run_backtest,
    updated_peak,
)
from simualpha_quant.execution.trade_log import FillRecord, TradeRecord
from simualpha_quant.schemas.simulate import SkippedSignalRecord

log = logging.getLogger(__name__)


# ─────────────────────────── orchestrator state ──────────────────────


@dataclass
class MultiTickerState:
    """Mutable aggregate state the orchestrator threads through
    its per-date iteration.

    Internal to this module — never exposed on the public
    ``BacktestResult`` return. All of the public output fields
    (``trades``, ``skipped``, ``equity_points``) live on this
    state during the run and are copied into a fresh
    ``BacktestResult`` at the end.

    INVARIANTS (checked in debug / violated means bug):

    * ``len(open_positions) <= max_open_positions`` at every
      moment of the iteration. The orchestrator's new-signal
      gate emits a ``max_open_positions`` skip instead of
      breaching this.
    * A ticker appears in AT MOST ONE of ``open_positions`` or
      ``pending_signals``. A ticker with an open position has its
      pending queue drained (the single-ticker
      ``same_ticker_already_open`` semantic enforces this).
      A ticker with pending signals has no open position on it.
    * ``cash + sum(mark-to-market positions_value) ==
      initial_capital + realized_pnl`` within a small
      floating-point epsilon. The equity-point emission tests
      this relationship implicitly; any divergence indicates a
      cash-flow bookkeeping bug (most likely a missing
      realized-P&L accumulation when a trade closes).

    FIELDS

    * ``open_positions``: ticker → PositionState. Mutated in
      place when tranches are added or exits applied.
    * ``pending_signals``: ticker → list of pending signals
      awaiting tranche-1 fill. Populated by new-signal
      processing; drained by per-bar rechecks or expiry.
    * ``signal_sets``: ticker → frozenset of signal dates.
      Built once at startup via
      ``_build_signal_set(spec, ticker, prices)``.
    * ``price_frames``: ticker → pandas DataFrame. Kept on the
      state so later per-bar resolutions can reach the full
      series (e.g. at_ma rule recomputation).
    * ``date_to_idx``: ticker → dict[date, int]. Precomputed
      once per ticker for O(1) bar-date → integer-index lookups
      inside dynamic rule resolvers.
    * ``trades``: completed ``TradeRecord`` list in order of
      closing.
    * ``skipped``: ``SkippedSignalRecord`` list.
    * ``equity_points``: one ``EquityPoint`` per date in the
      union of per-ticker date ranges.
    * ``bar_decisions``: per-ticker per-date trace. Tuples of
      (date, ticker, BarDecision). Populated only when the
      orchestrator's ``record_decisions=True`` is passed through;
      memory-bounded otherwise.
    * ``cash``: running dollar balance. Floats for tractability;
      tests bound divergence at 1e-6 dollars over 1000-bar
      backtests.
    * ``realized_pnl``: cumulative P&L dollars from closed
      trades. Fed by ``_trade_realized_pnl_dollars`` every time
      a trade is appended to ``trades``.
    * ``initial_capital``: passed through for the final equity
      reconciliation at end-of-data.
    * ``max_open_positions``: the global cap. Constant for the
      lifetime of the run.
    * ``pivots``: ticker → pivot list, cached at startup so
      Wave-1 anchor detection happens exactly once per ticker.
    * ``last_close``: ticker → most recent observed close.
      Updated on every processed bar. Used by the equity-point
      emission when a ticker has no bar on the current
      iteration date (calendar mismatches, holidays that don't
      line up across the universe, etc.).
    """

    open_positions: dict[str, PositionState] = field(default_factory=dict)
    pending_signals: dict[str, list[_PendingSignal]] = field(default_factory=dict)
    signal_sets: dict[str, frozenset[date]] = field(default_factory=dict)
    price_frames: dict[str, pd.DataFrame] = field(default_factory=dict)
    date_to_idx: dict[str, dict[date, int]] = field(default_factory=dict)
    pivots: dict[str, list] = field(default_factory=dict)
    last_close: dict[str, float] = field(default_factory=dict)

    trades: list[TradeRecord] = field(default_factory=list)
    skipped: list[SkippedSignalRecord] = field(default_factory=list)
    equity_points: list[EquityPoint] = field(default_factory=list)
    bar_decisions: list[tuple[date, str, BarDecision]] = field(default_factory=list)

    cash: float = 0.0
    realized_pnl: float = 0.0
    initial_capital: float = 100_000.0
    max_open_positions: int = 5
