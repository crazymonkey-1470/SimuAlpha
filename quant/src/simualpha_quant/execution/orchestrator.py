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


# ─────────────────────────── preparation helpers ─────────────────────
#
# All functions below are PURE — they return values and never mutate
# any external state. The only state constructor is
# ``initialize_multi_ticker_state`` at the bottom; every other way to
# build a ``MultiTickerState`` is considered an invariant break.
#
# Preparation failures raise ``ValueError`` with ticker-tagged
# messages. Unlike signal-detection errors (which are data issues —
# the detector might reasonably fail on a noisy frame), preparation
# problems are caller bugs: a typo in the universe list, a missing
# column in a price frame, a date index that isn't sorted. Silent
# degradation would hide real bugs.


_REQUIRED_PRICE_COLUMNS = ("open", "high", "low", "close", "volume")


def _validate_price_frame(ticker: str, prices: pd.DataFrame) -> pd.DatetimeIndex:
    """Mirrors run_backtest's validation for a single price frame.

    Raises ``ValueError`` on column / emptiness / monotonicity /
    duplicate-date violations. Returns the parsed DatetimeIndex
    for downstream use (``_build_union_date_index`` re-uses it).
    """
    if not hasattr(prices, "columns") or not hasattr(prices, "index"):
        raise ValueError(
            f"orchestrator({ticker}): prices must be a pandas DataFrame"
        )
    missing = [c for c in _REQUIRED_PRICE_COLUMNS if c not in prices.columns]
    if missing:
        raise ValueError(
            f"orchestrator({ticker}): prices missing required columns: {missing}"
        )
    if len(prices) == 0:
        raise ValueError(f"orchestrator({ticker}): prices is empty")

    try:
        parsed = pd.DatetimeIndex(prices.index)
    except Exception as exc:
        raise ValueError(
            f"orchestrator({ticker}): prices index cannot be parsed as "
            f"DatetimeIndex: {exc}"
        ) from exc
    if not parsed.is_monotonic_increasing:
        raise ValueError(
            f"orchestrator({ticker}): prices index must be sorted ascending"
        )
    if parsed.has_duplicates:
        dupes = parsed[parsed.duplicated()]
        raise ValueError(
            f"orchestrator({ticker}): prices index has duplicate dates: "
            f"{list(dupes[:5])}{' ...' if len(dupes) > 5 else ''}"
        )
    return parsed


def _build_universe_signal_sets(
    spec, universe: list[str], prices_by_ticker: dict[str, pd.DataFrame]
) -> dict[str, frozenset[date]]:
    """Run ``_build_signal_set`` for every ticker and collect the
    results into a single mapping.

    Per-ticker detector failures are absorbed — the underlying
    ``_build_signal_set`` already logs ERROR and returns an empty
    frozenset for that ticker, so the aggregation keeps going. This
    matches the single-ticker defensive pattern: one bad detector
    shouldn't torpedo the whole universe.

    Emits a single INFO log summarizing aggregate counts so a
    low-total-trade outcome is diagnosable directly from the log.
    """
    out: dict[str, frozenset[date]] = {}
    aggregate = 0
    empty_tickers: list[str] = []
    for ticker in universe:
        prices = prices_by_ticker[ticker]
        sig_set = _build_signal_set(spec, ticker, prices)
        out[ticker] = sig_set
        aggregate += len(sig_set)
        if not sig_set:
            empty_tickers.append(ticker)

    log.info(
        "universe signals built",
        extra={
            "universe_size": len(universe),
            "aggregate_signals": aggregate,
            "tickers_with_no_signals": empty_tickers,
        },
    )
    return out


def _build_union_date_index(
    prices_by_ticker: dict[str, pd.DataFrame],
) -> list[date]:
    """Union of every ticker's trading dates, sorted ascending.

    UNION rather than intersection: in a multi-ticker equity
    backtest we want to process every day any ticker has data
    for. A day where only some tickers have bars is a day where
    the missing tickers simply don't get evaluated; they contribute
    nothing to the per-date step but shouldn't drop the date
    entirely, because other tickers DO have live signals there.

    Emits a summary INFO log at the end: total unique dates,
    window start/end, ticker count. No raise — an empty
    ``prices_by_ticker`` returns an empty list and the downstream
    loop simply does nothing.
    """
    all_dates: set[date] = set()
    for ticker, prices in prices_by_ticker.items():
        parsed = pd.DatetimeIndex(prices.index)
        all_dates.update(pd.Timestamp(d).date() for d in parsed)

    sorted_dates = sorted(all_dates)
    log.info(
        "union date index built",
        extra={
            "unique_dates": len(sorted_dates),
            "window_start": str(sorted_dates[0]) if sorted_dates else None,
            "window_end": str(sorted_dates[-1]) if sorted_dates else None,
            "ticker_count": len(prices_by_ticker),
        },
    )
    return sorted_dates


def _build_ticker_date_index(prices: pd.DataFrame) -> dict[date, int]:
    """Per-ticker date → integer bar index. Wraps equity_backtester's
    ``_date_to_index_map`` so this module's preparation surface has
    a named, documented helper for symmetry with the other
    _build_* functions. O(1) lookups thereafter.
    """
    return _date_to_index_map(prices)


def _build_price_pivot_cache(prices: pd.DataFrame, ticker: str) -> list:
    """Wave-pivot detection run once per ticker at startup.

    Delegates to ``_detect_pivots_cached`` from equity_backtester,
    which uses the "intermediate" sensitivity the Stage-3 patterns
    are calibrated against. Per-date rule resolution reads this
    cached result; nothing recomputes pivots inside the main loop.

    Defensive: if pivot detection raises, log a WARNING tagged
    with the ticker and return an empty list. An empty pivot list
    means ``at_fib`` rules will fail to resolve, which the main
    loop handles as ``price_rule_unresolvable`` skips — one bad
    ticker should not kill the whole universe.
    """
    try:
        return _detect_pivots_cached(prices)
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "pivot detection failed, treating as no pivots",
            extra={"ticker": ticker, "err": str(exc)},
        )
        return []


def _get_bar_for_ticker(
    state: MultiTickerState, ticker: str, current_date: date
) -> Optional[Bar]:
    """Return the Bar for ``ticker`` on ``current_date``, or None.

    Used by the per-date step (3b-i-C) to check presence before
    attempting any per-ticker logic. ``None`` means "this ticker
    simply has no bar on this date" — holiday, listing gap,
    calendar mismatch across the universe, etc. Caller skips this
    ticker for this date and moves on.

    Does NOT apply the ``_bar_is_sane`` check — that's the per-
    date step's responsibility (the single-ticker backtester does
    its sanity check AFTER pulling the bar, and we mirror that).
    """
    idx = state.date_to_idx.get(ticker, {}).get(current_date)
    if idx is None:
        return None
    prices = state.price_frames.get(ticker)
    if prices is None:
        return None
    return _row_to_bar(prices, idx)


# ─────────────────────────── state constructor ───────────────────────


def initialize_multi_ticker_state(
    spec,
    universe: list[str],
    prices_by_ticker: dict[str, pd.DataFrame],
    initial_capital: float,
    max_open_positions: int,
) -> MultiTickerState:
    """Single canonical constructor for ``MultiTickerState``.

    Direct ``MultiTickerState(...)`` construction elsewhere is an
    invariant break — the per-ticker dicts must be populated
    consistently, which is what this function guarantees. Every
    code path in the orchestrator's public surface (3b-i-D)
    starts from here.

    VALIDATION

    * Every ticker in ``universe`` must have a matching entry in
      ``prices_by_ticker``. A missing ticker raises ``ValueError``
      naming the specific offender. Extra tickers in
      ``prices_by_ticker`` that aren't in ``universe`` are logged
      (INFO) and ignored — the universe defines the run.
    * Each price frame is validated via ``_validate_price_frame``
      (columns / parseable index / sorted / unique). Failures
      raise ``ValueError`` with a ticker-tagged message.
    * ``initial_capital`` must be positive; ``max_open_positions``
      must be positive. Violations raise ``ValueError``.

    STATE POPULATION

    After validation, calls the four preparation helpers in order:
    universe-wide signal sets, per-ticker date indices, per-ticker
    pivots, and a final MultiTickerState construction with empty
    pending/open/trade/skipped/equity/decision collections plus the
    cash and realized-P&L accumulators initialized to their
    starting values.

    Emits one INFO summary log at the end so a reader of the
    Railway / CI output sees the run's shape at a glance.
    """
    if initial_capital <= 0:
        raise ValueError(
            f"orchestrator: initial_capital must be positive, got {initial_capital}"
        )
    if max_open_positions <= 0:
        raise ValueError(
            f"orchestrator: max_open_positions must be positive, got {max_open_positions}"
        )

    missing_tickers = [t for t in universe if t not in prices_by_ticker]
    if missing_tickers:
        raise ValueError(
            f"orchestrator: universe tickers missing from prices_by_ticker: "
            f"{missing_tickers}"
        )

    extra_tickers = [t for t in prices_by_ticker if t not in universe]
    if extra_tickers:
        log.info(
            "orchestrator: extra tickers in prices_by_ticker ignored",
            extra={"extra_tickers": extra_tickers},
        )

    # Validate each frame AND collect a trimmed dict containing
    # only the universe tickers (the state never references extras).
    validated_frames: dict[str, pd.DataFrame] = {}
    for ticker in universe:
        _validate_price_frame(ticker, prices_by_ticker[ticker])
        validated_frames[ticker] = prices_by_ticker[ticker]

    signal_sets = _build_universe_signal_sets(spec, universe, validated_frames)
    date_to_idx = {
        ticker: _build_ticker_date_index(validated_frames[ticker])
        for ticker in universe
    }
    pivots = {
        ticker: _build_price_pivot_cache(validated_frames[ticker], ticker)
        for ticker in universe
    }

    state = MultiTickerState(
        open_positions={},
        pending_signals={ticker: [] for ticker in universe},
        signal_sets=signal_sets,
        price_frames=validated_frames,
        date_to_idx=date_to_idx,
        pivots=pivots,
        last_close={},
        trades=[],
        skipped=[],
        equity_points=[],
        bar_decisions=[],
        cash=float(initial_capital),
        realized_pnl=0.0,
        initial_capital=float(initial_capital),
        max_open_positions=int(max_open_positions),
    )

    union_dates = _build_union_date_index(validated_frames)
    log.info(
        "orchestrator state initialized",
        extra={
            "universe_size": len(universe),
            "initial_capital": initial_capital,
            "max_open_positions": max_open_positions,
            "aggregate_signals": sum(len(s) for s in signal_sets.values()),
            "window_start": str(union_dates[0]) if union_dates else None,
            "window_end": str(union_dates[-1]) if union_dates else None,
            "total_dates": len(union_dates),
        },
    )
    return state
