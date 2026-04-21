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
    BacktesterInvariantError,
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
from simualpha_quant.execution.price_rules import UnresolvablePriceRule
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


# ─────────────────────────── per-ticker per-date step ────────────────
#
# One pass through SECTIONS 2a / 2b / 2c of run_backtest for a
# single (ticker, date) pair. Designed to be called by the outer
# per-date loop (3b-i-C-2) once per ticker in tie-break order BEFORE
# any exits or tranche adds are processed.
#
# Tranche adds and exits land in 3b-i-C-2, and they run AFTER every
# ticker has made its new-signal decision for the day. Rationale:
# the global ``max_open_positions`` cap must be evaluated
# consistently. A position closing this same date shouldn't free up
# a slot for a new signal that was already evaluated (or rejected)
# earlier in the iteration. End-of-day exits are the clean
# boundary — they free slots for TOMORROW, not for later-in-today.


def _advance_ticker_one_day(
    state: MultiTickerState,
    ticker: str,
    current_date: date,
    spec,
    record_decisions: bool,
) -> None:
    """Advance one ticker's state by one day.

    Mirrors the single-ticker ``run_backtest`` SECTION 2a + 2b + 2c
    for this (ticker, date) pair, adapted for per-ticker dicts
    and the global-cap enforcement.

    Mutates ``state`` in place:
      * ``state.open_positions[ticker]``  peak ratchet, new entry,
                                         entry from pending fill
      * ``state.pending_signals[ticker]``  drained on fill or
                                          expiry, appended on new
                                          signal that doesn't fill
                                          immediately
      * ``state.skipped``                append on cap-breach, on
                                         same_ticker_already_open,
                                         on expiry, on resolver
                                         failures
      * ``state.bar_decisions``          append SKIP on malformed
                                         bar or ENTRY on
                                         open-position (record_
                                         decisions gated)
      * ``state.cash``                    decremented by
                                         (notional + fee) on every
                                         entry fill; symmetric
                                         exit-side update happens
                                         in 3b-i-C-2.
      * ``state.last_close[ticker]``     updated to bar.close so
                                         3b-i-C-2 can mark open
                                         positions on dates where
                                         a ticker has no bar.

    Tranche adds and exits intentionally omitted — they belong to
    the second pass in 3b-i-C-2.

    Returns None. Silent when the ticker has no bar on this date
    (common case when universe tickers have mismatched calendars).
    """
    # Step (a): presence check.
    bar = _get_bar_for_ticker(state, ticker, current_date)
    if bar is None:
        return

    # Step (b): sanity.
    if not _bar_is_sane(bar):
        log.warning(
            "orchestrator: malformed bar, skipping",
            extra={"ticker": ticker, "date": current_date},
        )
        if record_decisions:
            state.bar_decisions.append((current_date, ticker, BarDecision.SKIP))
        return

    state.last_close[ticker] = float(bar.close)

    # Step (c): peak ratchet on open position.
    open_pos = state.open_positions.get(ticker)
    if open_pos is not None:
        open_pos.current_peak = updated_peak(open_pos.current_peak, bar)

    # Step (d): process pending signals for this ticker.
    pending_list = state.pending_signals.get(ticker, [])
    if pending_list:
        still_pending: list[_PendingSignal] = []
        for pending in pending_list:
            fill = _try_tranche_1_fill_pending(bar, pending, ticker, spec.execution)

            if fill is None:
                # No fill today — decrement or expire.
                pending.remaining_wait_bars -= 1
                if pending.remaining_wait_bars <= 0:
                    state.skipped.append(
                        SkippedSignalRecord(
                            ticker=ticker,
                            signal_date=pending.signal_date,
                            reason="tranche_1_unfilled_within_wait_cap",
                            detail=(
                                f"entry_wait_bars="
                                f"{spec.execution.entry_wait_bars} elapsed "
                                f"without tranche-1 fill"
                            ),
                        )
                    )
                else:
                    still_pending.append(pending)
                continue

            # Fill landed. Two gating conditions before we open:
            # ticker-already-open (from an earlier pending this same
            # bar or a held-over position) and the global cap.

            if ticker in state.open_positions:
                state.skipped.append(
                    SkippedSignalRecord(
                        ticker=ticker,
                        signal_date=pending.signal_date,
                        reason="same_ticker_already_open",
                        detail=(
                            "pending tranche-1 fill blocked by open "
                            f"position entered "
                            f"{state.open_positions[ticker].entry_date}"
                        ),
                    )
                )
                continue  # drop the pending

            if len(state.open_positions) >= state.max_open_positions:
                state.skipped.append(
                    SkippedSignalRecord(
                        ticker=ticker,
                        signal_date=pending.signal_date,
                        reason="max_open_positions",
                        detail=(
                            f"global cap={state.max_open_positions} "
                            "reached; pending discarded "
                            "(fire-and-forget on cap breach)"
                        ),
                    )
                )
                continue  # drop the pending — don't re-queue

            # Slot available. Resolve stop against the real
            # entry_price, then open.
            stop_rule = _resolve_stop(
                spec,
                state.price_frames[ticker],
                pending.signal_bar_idx,
                fill.price,
                pivots=state.pivots[ticker],
                date_idx=state.date_to_idx[ticker],
            )
            if stop_rule is None:
                state.skipped.append(
                    SkippedSignalRecord(
                        ticker=ticker,
                        signal_date=pending.signal_date,
                        reason="price_rule_unresolvable",
                        detail="stop rule could not resolve at fill time",
                    )
                )
                continue

            try:
                new_pos = _open_position(
                    signal_date=pending.signal_date,
                    bar=bar,
                    tranche_ladder=pending.tranche_ladder,
                    tp_legs=pending.tp_legs,
                    stop_rule=stop_rule,
                    time_stop_days=pending.time_stop_days,
                    planned_capital=pending.planned_capital,
                    entry_fill=fill,
                    ticker=ticker,
                )
            except Exception as exc:  # noqa: BLE001
                log.error(
                    "invariant violated opening pending signal",
                    extra={
                        "ticker": ticker,
                        "signal_date": pending.signal_date,
                        "err": str(exc),
                    },
                )
                continue

            state.open_positions[ticker] = new_pos
            state.cash -= fill.notional + fill.fee
            if record_decisions:
                state.bar_decisions.append(
                    (current_date, ticker, BarDecision.ENTRY)
                )
            # Drop from pending — new_pos owns the lifecycle now.

        state.pending_signals[ticker] = still_pending

    # Step (e): new-signal check for this bar.
    if current_date in state.signal_sets.get(ticker, frozenset()):
        # Cheap early exits for the two gating conditions.
        if ticker in state.open_positions:
            state.skipped.append(
                SkippedSignalRecord(
                    ticker=ticker,
                    signal_date=current_date,
                    reason="same_ticker_already_open",
                    detail=(
                        f"position opened on "
                        f"{state.open_positions[ticker].entry_date} still active"
                    ),
                )
            )
            return

        if len(state.open_positions) >= state.max_open_positions:
            state.skipped.append(
                SkippedSignalRecord(
                    ticker=ticker,
                    signal_date=current_date,
                    reason="max_open_positions",
                    detail=(
                        f"global cap={state.max_open_positions} "
                        "reached; signal discarded "
                        "(fire-and-forget on cap breach)"
                    ),
                )
            )
            return

        # Resolve ladder + TPs at the signal bar.
        bar_idx = state.date_to_idx[ticker][current_date]
        try:
            tranche_ladder = _resolve_tranche_ladder(
                spec,
                state.price_frames[ticker],
                bar_idx,
                pivots=state.pivots[ticker],
                date_idx=state.date_to_idx[ticker],
            )
            tp_legs = _resolve_tp_legs(
                spec,
                state.price_frames[ticker],
                bar_idx,
                pivots=state.pivots[ticker],
                date_idx=state.date_to_idx[ticker],
            )
        except UnresolvablePriceRule as exc:
            state.skipped.append(
                SkippedSignalRecord(
                    ticker=ticker,
                    signal_date=current_date,
                    reason="price_rule_unresolvable",
                    detail=f"ladder/TPs: {exc}",
                )
            )
            return
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "rule resolution errored at signal",
                extra={"ticker": ticker, "date": current_date, "err": str(exc)},
            )
            state.skipped.append(
                SkippedSignalRecord(
                    ticker=ticker,
                    signal_date=current_date,
                    reason="price_rule_unresolvable",
                    detail=str(exc),
                )
            )
            return

        planned_capital = _planned_capital_for(
            spec, prices=state.price_frames[ticker], signal_idx=bar_idx
        )

        tranche_1_pct, tranche_1_rule = tranche_ladder[0]
        first_tranche_spec = spec.entry.tranches[0]
        is_at_signal = first_tranche_spec.price_rule.type == "at_signal"
        first_trigger: Optional[float] = None
        if not is_at_signal:
            try:
                first_trigger = tranche_1_rule.price(bar, position=None)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "tranche-1 trigger resolve failed at signal",
                    extra={"ticker": ticker, "err": str(exc)},
                )
                first_trigger = None

        entry_ctx = EntryContext(
            first_tranche_trigger=first_trigger,
            first_tranche_pct=float(tranche_1_pct),
            first_tranche_index=0,
            is_at_signal_rule=is_at_signal,
        )

        entry_fill = evaluate_entry(
            bar=bar,
            ticker=ticker,
            planned_capital=planned_capital,
            ctx=entry_ctx,
            signal_set=frozenset([current_date]),
            execution=spec.execution,
        )

        if entry_fill is not None:
            # Immediate fill.
            stop_rule = _resolve_stop(
                spec,
                state.price_frames[ticker],
                bar_idx,
                entry_fill.price,
                pivots=state.pivots[ticker],
                date_idx=state.date_to_idx[ticker],
            )
            if stop_rule is None:
                state.skipped.append(
                    SkippedSignalRecord(
                        ticker=ticker,
                        signal_date=current_date,
                        reason="price_rule_unresolvable",
                        detail="stop rule unresolvable at entry",
                    )
                )
                return

            try:
                new_pos = _open_position(
                    signal_date=current_date,
                    bar=bar,
                    tranche_ladder=tranche_ladder,
                    tp_legs=tp_legs,
                    stop_rule=stop_rule,
                    time_stop_days=spec.exit.time_stop_days,
                    planned_capital=planned_capital,
                    entry_fill=entry_fill,
                    ticker=ticker,
                )
            except Exception as exc:  # noqa: BLE001
                log.error(
                    "invariant violated opening new signal",
                    extra={
                        "ticker": ticker,
                        "signal_date": current_date,
                        "err": str(exc),
                    },
                )
                state.skipped.append(
                    SkippedSignalRecord(
                        ticker=ticker,
                        signal_date=current_date,
                        reason="price_rule_unresolvable",
                        detail=f"invariant: {exc}",
                    )
                )
                return

            state.open_positions[ticker] = new_pos
            state.cash -= entry_fill.notional + entry_fill.fee
            if record_decisions:
                state.bar_decisions.append(
                    (current_date, ticker, BarDecision.ENTRY)
                )
        else:
            # No fill this bar — push pending or immediate skip.
            if spec.execution.entry_wait_bars == 0:
                state.skipped.append(
                    SkippedSignalRecord(
                        ticker=ticker,
                        signal_date=current_date,
                        reason="tranche_1_unfilled_within_wait_cap",
                        detail="entry_wait_bars=0, no grace period",
                    )
                )
            else:
                state.pending_signals[ticker].append(
                    _PendingSignal(
                        signal_date=current_date,
                        remaining_wait_bars=spec.execution.entry_wait_bars,
                        tranche_1_rule=tranche_1_rule,
                        tranche_1_pct=float(tranche_1_pct),
                        entry_ctx=entry_ctx,
                        tranche_ladder=tranche_ladder,
                        tp_legs=tp_legs,
                        time_stop_days=spec.exit.time_stop_days,
                        planned_capital=planned_capital,
                        signal_bar_close=float(bar.close),
                        signal_bar_idx=bar_idx,
                    )
                )


# ─────────────────────────── outer per-date sweep ────────────────────
#
# Advances EVERY ticker by one day, in four phases. The per-ticker
# inner step (_advance_ticker_one_day) handles new-signal decisions
# under the global cap; this outer step wraps it with tranche adds,
# exits, and one aggregate equity emission.
#
# Phase ordering rationale (mirrors run_backtest's SECTION ordering
# but adapted for multi-ticker):
#
#   PHASE 1 — new-signal evaluation PER TICKER (via
#             _advance_ticker_one_day), in tie-break order. The
#             global cap is visible to every ticker based on the
#             state of open_positions at THIS moment — a ticker
#             evaluated later in the order sees any slots opened
#             earlier the same bar.
#
#   PHASE 2 — tranche adds on already-open positions. One-tranche-
#             per-bar per position.
#
#   PHASE 3 — exits on already-open positions. Close trades when
#             remaining_shares hits zero.
#
#   PHASE 4 — aggregate EquityPoint emission. Single cross-sectional
#             snapshot at the close of the current date.
#
# Phases 2 and 3 run AFTER Phase 1 by design: a position closing
# today shouldn't retroactively free a slot for a signal that was
# already rejected under the cap. End-of-day is the clean boundary;
# the slot opens up for TOMORROW, not for earlier-in-today. The
# same logic applies to the stop/TP cascade itself — today's stops
# don't free slots for today's new signals.


def _advance_all_tickers_one_day(
    state: MultiTickerState,
    current_date: date,
    spec,
    record_decisions: bool,
    tie_breaker: Callable[[list[str]], list[str]],
    ctx_hook: Optional[Callable] = None,
) -> None:
    """Advance every ticker in ``state`` by one day.

    Mutates state in place. Returns None. Raises
    ``BacktesterInvariantError`` on cash/position bookkeeping
    violations that should never happen in production (negative
    cash beyond floating-point noise, closed trade with no fills,
    etc.) — these are bugs in the backtester itself, not data
    issues.
    """
    # Snapshot for Phase 5 HOLD detection — records appended across
    # phases 1-3 are compared against this to figure out which
    # tickers didn't get a decision today.
    decisions_start = len(state.bar_decisions)

    # Precompute: which tickers have a (sane) bar today? Used by
    # Phase 4 mark-to-market and Phase 5 HOLD backfill.
    tickers_with_bars_today: list[str] = []
    for ticker in state.signal_sets.keys():
        bar = _get_bar_for_ticker(state, ticker, current_date)
        if bar is None or not _bar_is_sane(bar):
            continue
        tickers_with_bars_today.append(ticker)

    # ─── PHASE 1: per-ticker new-signal evaluation ─────────────────

    universe_list = list(state.signal_sets.keys())
    try:
        ordered_tickers = tie_breaker(universe_list)
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "tie_breaker raised; falling back to alphabetical",
            extra={"err": str(exc)},
        )
        ordered_tickers = sorted(universe_list)

    for ticker in ordered_tickers:
        _advance_ticker_one_day(
            state, ticker, current_date, spec, record_decisions
        )

    # ─── PHASE 2: tranche adds on already-open positions ───────────

    for ticker, pos in list(state.open_positions.items()):
        if not pos.tranche_queue:
            continue
        bar = _get_bar_for_ticker(state, ticker, current_date)
        if bar is None or not _bar_is_sane(bar):
            continue

        for tranche_idx, pct, rule in list(pos.tranche_queue):
            try:
                trigger = rule.price(bar, pos)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "tranche rule resolve failed",
                    extra={
                        "ticker": ticker,
                        "date": current_date,
                        "tranche_idx": tranche_idx,
                        "err": str(exc),
                    },
                )
                continue
            if trigger is None or trigger <= 0:
                continue

            fill = evaluate_tranche(
                bar=bar,
                position=pos,
                tranche_index=tranche_idx,
                pct_of_position=pct,
                resolved_trigger=trigger,
                execution=spec.execution,
            )
            if fill is None:
                continue

            pos.tranches_filled.append(fill)
            pos.filled_capital += fill.notional
            pos.tranche_queue = [
                t for t in pos.tranche_queue if t[0] != tranche_idx
            ]
            state.cash -= fill.notional + fill.fee
            if record_decisions:
                state.bar_decisions.append(
                    (current_date, ticker, BarDecision.ADD_TRANCHE)
                )
            break  # one-fill-per-bar per position

    # ─── PHASE 3: exits on already-open positions ──────────────────

    for ticker, pos in list(state.open_positions.items()):
        bar = _get_bar_for_ticker(state, ticker, current_date)
        if bar is None or not _bar_is_sane(bar):
            continue

        # Resolve stop (trailing reads current_peak internally;
        # Phase 1's _advance_ticker_one_day already ratcheted it).
        resolved_stop_price: Optional[float] = None
        if pos.stop_rule is not None:
            try:
                resolved_stop_price = float(pos.stop_rule.price(bar, pos))
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "stop rule resolve failed",
                    extra={"ticker": ticker, "date": current_date, "err": str(exc)},
                )

        resolved_tp_legs: list[tuple[int, float, float]] = []
        for leg_idx, pct, rule in pos.tp_queue:
            try:
                tp_price = float(rule.price(bar, pos))
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "tp rule resolve failed",
                    extra={
                        "ticker": ticker,
                        "date": current_date,
                        "leg": leg_idx,
                        "err": str(exc),
                    },
                )
                continue
            resolved_tp_legs.append((leg_idx, pct, tp_price))

        stop_fill = (
            evaluate_stop(bar, pos, resolved_stop_price, spec.execution)
            if resolved_stop_price is not None
            else None
        )
        tp_fills = evaluate_tp_legs(bar, pos, resolved_tp_legs, spec.execution)
        time_fill = evaluate_time_stop(
            bar, pos, pos.time_stop_days, spec.execution
        )

        ordered_exits = resolve_same_bar_conflict(
            stop_fill, tp_fills, spec.execution.same_bar_priority
        )

        total_entered_shares = sum(f.shares for f in pos.tranches_filled)

        def _remaining() -> float:
            return total_entered_shares - sum(f.shares for f in pos.exits_taken)

        any_exit_fired = False
        exit_decisions_this_bar: list[BarDecision] = []

        for exit_fill in ordered_exits:
            remaining_before = _remaining()
            if remaining_before <= 1e-9:
                break
            capped = _cap_exit_fill_shares(
                exit_fill, remaining_before, spec.execution.fee_bps
            )
            if capped.shares <= 1e-9:
                continue

            pos.exits_taken.append(capped)
            state.cash += capped.notional - capped.fee
            any_exit_fired = True

            if capped.exit_reason == "take_profit":
                if capped.leg_index is not None:
                    pos.tp_queue = [
                        t for t in pos.tp_queue if t[0] != capped.leg_index
                    ]
                exit_decisions_this_bar.append(BarDecision.TP_EXIT)
            elif capped.exit_reason == "stop_loss":
                exit_decisions_this_bar.append(BarDecision.STOP_EXIT)

            if _remaining() < -1e-6:
                raise BacktesterInvariantError(
                    f"remaining shares went negative after "
                    f"{capped.exit_reason} on {ticker}/{current_date}: "
                    f"entered={total_entered_shares} "
                    f"taken={sum(f.shares for f in pos.exits_taken)}"
                )

        # Time stop applies only if stop/TP left residual.
        if time_fill is not None:
            remaining_after = _remaining()
            if remaining_after > 1e-9:
                capped_time = _cap_exit_fill_shares(
                    time_fill, remaining_after, spec.execution.fee_bps
                )
                if capped_time.shares > 1e-9:
                    pos.exits_taken.append(capped_time)
                    state.cash += capped_time.notional - capped_time.fee
                    any_exit_fired = True
                    exit_decisions_this_bar.append(BarDecision.TIME_EXIT)

        if record_decisions and exit_decisions_this_bar:
            if BarDecision.STOP_EXIT in exit_decisions_this_bar:
                dominant = BarDecision.STOP_EXIT
            elif BarDecision.TP_EXIT in exit_decisions_this_bar:
                dominant = BarDecision.TP_EXIT
            else:
                dominant = BarDecision.TIME_EXIT
            state.bar_decisions.append((current_date, ticker, dominant))

        if any_exit_fired and _remaining() <= 1e-9:
            ctx = ctx_hook(bar, pos) if ctx_hook is not None else None
            try:
                trade = _close_and_emit_trade(pos, bar, ctx=ctx)
            except BacktesterInvariantError as exc:
                log.error(
                    "invariant violated closing trade",
                    extra={"ticker": ticker, "date": current_date, "err": str(exc)},
                )
                raise
            state.trades.append(trade)
            state.realized_pnl += _trade_realized_pnl_dollars(trade)
            del state.open_positions[ticker]

    # ─── PHASE 4: aggregate mark-to-market ────────────────────────

    positions_value = 0.0
    for ticker, pos in state.open_positions.items():
        total_entered = sum(f.shares for f in pos.tranches_filled)
        total_exited = sum(f.shares for f in pos.exits_taken)
        held = total_entered - total_exited
        if held <= 1e-9:
            continue
        # Prefer today's close, fall back to most recent observed
        # close for tickers with sparse / mismatched calendars.
        bar = _get_bar_for_ticker(state, ticker, current_date)
        if bar is not None and _bar_is_sane(bar):
            mark = float(bar.close)
        else:
            mark = state.last_close.get(ticker)
            if mark is None:
                continue
        positions_value += held * mark

    if not (state.cash == state.cash) or state.cash > 1e18 or state.cash < -1e18:
        # NaN / inf guard — the ``x == x`` idiom catches NaN which
        # compares unequal to itself. State like this means a fill
        # arithmetic bug upstream.
        raise BacktesterInvariantError(
            f"cash is non-finite on {current_date}: {state.cash}"
        )
    if state.cash < -1e-6:
        raise BacktesterInvariantError(
            f"cash went negative on {current_date}: {state.cash:.6f} "
            f"(open_positions={list(state.open_positions.keys())})"
        )

    equity = state.cash + positions_value
    state.equity_points.append(
        EquityPoint(
            date=current_date,
            equity=equity,
            cash=state.cash,
            positions_value=positions_value,
        )
    )

    # ─── PHASE 5: HOLD backfill (opt-in, sparse) ──────────────────
    #
    # Multi-ticker × multi-bar HOLD recording is num_tickers ×
    # num_bars worth of entries, which is a lot on large universes.
    # To keep the trace useful without blowing up memory, we only
    # append HOLD for tickers that HAD a (sane) bar today but
    # didn't get any other decision across phases 1-3. Tickers
    # with no bar today contribute nothing to the trace at all.

    if record_decisions:
        decided_today = {
            t for (_, t, _) in state.bar_decisions[decisions_start:]
        }
        for ticker in tickers_with_bars_today:
            if ticker not in decided_today:
                state.bar_decisions.append(
                    (current_date, ticker, BarDecision.HOLD)
                )
