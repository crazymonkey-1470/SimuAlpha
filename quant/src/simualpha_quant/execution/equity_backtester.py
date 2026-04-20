"""Pure-Python daily-bar equity backtester.

Replaces the freqtrade ``Backtesting`` integration that broke four
times across minor releases (see ``docs/freqtrade-decision.md``
ADR). Produces the same ``TradeRecord`` rows the aggregation
pipeline in ``trade_log.py`` already consumes, so the public
``simulate_strategy`` contract is unchanged — only the engine under
``run_simulation`` swaps out.

Contract summary (full details below):

1. **Input**: a ``StrategySpec`` + per-ticker price frames (OHLCV
   daily, adjusted).
2. **Output**: ordered ``TradeRecord`` list + equity curve +
   skipped-signal trace. Aggregation happens downstream.
3. **Determinism**: same inputs → same outputs, byte-for-byte.
   Tie-breakers are explicit everywhere.

─────────────────────────── assumptions ──────────────────────────────

**Adjusted-close semantics (uniform).**
  All input prices are assumed split- and dividend-adjusted. The
  backtester does NOT model dividend income separately — dividends
  are already baked into the adjusted-close series via standard
  back-adjustment. Suspiciously unadjusted-looking data (a >5% gap
  with no corresponding volume spike or news flag) is flagged by
  the data-integrity check at load time; the engine warns but does
  not fail, and the operator is expected to repair the series
  upstream.

**Long-only, cash account.**
  Positions are long, opened via a fixed ladder of tranches (DCA
  style), exited via take-profit legs + stop + optional time-stop.
  No shorting, no margin, no options. Matches the StrategySpec DSL
  as shipped.

─────────────────────────── fill_type contract ───────────────────────

Every fill logs one of three fill_types so debugging is trivial:

- ``signal_close``:    tranche 1 when ``price_rule.type == "at_signal"``.
                       Price = signal bar's close. Only used for
                       tranche-1 fills on the signal bar.
- ``intraday_touch``:  ``bar.low <= trigger <= bar.high``. Fill price
                       = trigger. Applies to all non-signal tranches
                       and to stop / TP trigger fills.
- ``gap_fill``:        bar gapped past the trigger (open is already
                       through it). Fill price = ``bar.open``. Used
                       for tranche fills on gap-downs and stop fills
                       on gap-downs.

Pick list is finalized — no other fill_type values exist today.

─────────────────────────── same_bar_priority ────────────────────────

When stop and one-or-more TP legs all trigger on the same daily bar
(only possible because we can't know intraday path from daily OHLC),
the ``StrategySpec.execution.same_bar_priority`` field picks the tie-
breaker:

- ``"stop"`` (default): stop wins. All TPs on that bar are discarded.
                        Conservative — avoids systematically over-
                        reporting wins.
- ``"tp"``:             TPs fire FIRST in spec order; stop fires for
                        any residual remaining after all TPs. Use
                        when the stop sits structurally far from
                        entry (TLI w/ 0.786-fib stop + Wave-3
                        extension TPs).

Reserved future value ``"time_weighted"`` documented on
``ExecutionConfig`` but not yet implemented.

─────────────────────────── rule resolution ──────────────────────────

Price rules resolve into one of three ``ResolvedRule`` kinds at
entry time, picked by rule type:

- **static**          ``at_signal``, ``at_price``, ``at_fib``
                      Resolved once at entry against the signal
                      bar's context (Wave 1 anchors, fib levels).
                      Cached as a float; every subsequent bar
                      reads the same number.
- **market_dynamic**  ``at_ma``
                      Re-resolved each bar against the current MA
                      value. The resolver closes over the full
                      price series + a date→index map.
- **position_dynamic** Any rule whose StopLoss wraps it as
                      ``type="trailing"``.
                      Re-resolved each bar from ``PositionState.
                      current_peak``. Ratchets: the effective stop
                      price only rises, never falls. Initial
                      distance-below-entry is preserved.

``ResolvedRule.price(bar, position)`` is the single callsite
evaluators use — kind-dispatch lives inside the wrapper.

─────────────────────────── record shapes ────────────────────────────

``FillRecord`` (from ``trade_log.py``) carries both entries and
exits. The ``side`` field distinguishes. ``ExitRecord`` is a module-
local type alias for ``FillRecord`` used only in signatures where
the return is guaranteed ``side="exit"`` — it's a readability knob,
not a new type.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Callable, Literal, Optional

from simualpha_quant.execution.trade_log import FillRecord
from simualpha_quant.schemas.simulate import SkippedSignalRecord

log = logging.getLogger(__name__)

# Module-local alias so exit-only signatures read clearly. See the
# module docstring for the unification rationale.
ExitRecord = FillRecord


# ─────────────────────────── bar container ────────────────────────────


@dataclass(frozen=True)
class Bar:
    """One daily OHLCV row. Immutable so it's safe to share across
    primitive calls without defensive copies.

    ``volume`` is float rather than int to accommodate split-
    adjusted volume series which become non-integer after
    back-adjustment.
    """

    date: date
    open: float
    high: float
    low: float
    close: float
    volume: float


# ─────────────────────────── resolved price rule ──────────────────────


_ResolvedKind = Literal["static", "market_dynamic", "position_dynamic"]


@dataclass
class ResolvedRule:
    """A PriceRule after initial resolution.

    Three kinds, dispatched inside ``price()`` so evaluators can
    uniformly call ``rule.price(bar, position)`` without caring
    whether the rule is cached or recomputed.

    Construct via the factory classmethods — never instantiate
    directly.
    """

    kind: _ResolvedKind
    _cached_price: Optional[float] = None
    _resolver: Optional[Callable[["Bar", Optional["PositionState"]], float]] = None

    @classmethod
    def static(cls, price: float) -> "ResolvedRule":
        """``at_signal`` / ``at_price`` / ``at_fib`` — frozen at entry."""
        return cls(kind="static", _cached_price=float(price))

    @classmethod
    def market_dynamic(
        cls,
        resolver: Callable[["Bar", Optional["PositionState"]], float],
    ) -> "ResolvedRule":
        """``at_ma`` — re-resolved from the current bar / price series."""
        return cls(kind="market_dynamic", _resolver=resolver)

    @classmethod
    def position_dynamic(
        cls,
        resolver: Callable[["Bar", Optional["PositionState"]], float],
    ) -> "ResolvedRule":
        """Trailing stops — re-resolved from ``PositionState.current_peak``."""
        return cls(kind="position_dynamic", _resolver=resolver)

    def price(self, bar: "Bar", position: Optional["PositionState"] = None) -> float:
        """Return the resolved dollar price at this bar."""
        if self.kind == "static":
            assert self._cached_price is not None
            return self._cached_price
        assert self._resolver is not None
        return float(self._resolver(bar, position))


# ─────────────────────────── position state ───────────────────────────


@dataclass
class PositionState:
    """Mutable per-position state threaded through the main loop.

    The main loop mutates ``tranches_filled``, ``exits_taken``,
    ``filled_capital``, and ``current_peak`` as bars are processed.
    The pure per-bar evaluators read but never write.
    """

    ticker: str
    planned_capital: float
    entry_date: date
    entry_signal_date: date
    entry_signal_close: float        # cached close at signal bar (for at_signal)
    filled_capital: float = 0.0
    tranches_filled: list[FillRecord] = field(default_factory=list)
    exits_taken: list[ExitRecord] = field(default_factory=list)
    # Unfilled tranches remaining, in spec order. Each entry is a
    # (tranche_index, pct_of_position, resolved_rule) triple. Main loop
    # pops fills off this list as they land.
    tranche_queue: list[tuple[int, float, ResolvedRule]] = field(default_factory=list)
    # Unfilled TP legs remaining, in spec order.
    tp_queue: list[tuple[int, float, ResolvedRule]] = field(default_factory=list)
    stop_rule: Optional[ResolvedRule] = None
    time_stop_days: Optional[int] = None
    # Updated each bar by the main loop to max(current_peak, bar.high).
    # Trailing stops ratchet against this.
    current_peak: float = 0.0

    @property
    def remaining_pct(self) -> float:
        """Fraction of planned position still open (0.0 = fully exited)."""
        taken = sum(e.shares for e in self.exits_taken)
        total_entered = sum(t.shares for t in self.tranches_filled)
        if total_entered <= 0:
            return 0.0
        return max(0.0, 1.0 - (taken / total_entered))

    @property
    def is_open(self) -> bool:
        return self.remaining_pct > 1e-9


# ─────────────────────────── bar decision enum ────────────────────────


class BarDecision(str, Enum):
    """What the main loop did on a given (ticker, bar) tuple.

    Emitted into a per-bar trace when verbose logging is enabled so
    OpenClaw can diagnose "why did X ticker produce no trades?".
    String-valued so it serializes cleanly.
    """

    ENTRY = "entry"                # tranche-1 fill at signal
    ADD_TRANCHE = "add_tranche"    # later tranche filled
    TP_EXIT = "tp_exit"            # one or more TP legs fired
    STOP_EXIT = "stop_exit"        # stop hit (hard or trailing)
    TIME_EXIT = "time_exit"        # time_stop_days exceeded
    HOLD = "hold"                  # position open, nothing triggered
    SKIP = "skip"                  # no position, no signal


# ─────────────────────────── bar sanity check ─────────────────────────


def _bar_is_sane(bar: Bar) -> bool:
    """Strict-but-practical OHLCV validity check.

    Returns False when the bar is clearly broken (NaN, negative
    price, open/close outside [low, high], high < low). Primitives
    call this at the top and return None with a warning so a single
    corrupt row doesn't poison the whole backtest.
    """
    import math
    fields = (bar.open, bar.high, bar.low, bar.close)
    if any(math.isnan(v) or math.isinf(v) for v in fields):
        return False
    if bar.high < bar.low:
        return False
    if bar.low < 0 or bar.close < 0 or bar.open < 0:
        return False
    # Allow a hair of floating-point noise around the high/low frame.
    eps = max(abs(bar.high), 1e-9) * 1e-9
    if bar.open < bar.low - eps or bar.open > bar.high + eps:
        return False
    if bar.close < bar.low - eps or bar.close > bar.high + eps:
        return False
    return True


# ─────────────────────────── slippage + fees ──────────────────────────


def apply_slippage(
    price: float,
    direction: Literal["buy", "sell"],
    slippage_bps: float,
) -> float:
    """Apply ADVERSE slippage to a fill price.

    Slippage is asymmetric by design — it always hurts the
    strategy. A buy at a $100 trigger with slippage_bps=10 fills at
    $100.10; a sell at the same trigger fills at $99.90. This
    reflects the realism that a market order lifting the offer
    will usually pay above mid, and a market order hitting the bid
    will usually sell below mid.

    Zero slippage passes the price through unchanged.
    """
    if slippage_bps <= 0:
        return float(price)
    adj = float(price) * slippage_bps / 10_000.0
    return float(price) + adj if direction == "buy" else float(price) - adj


def apply_fee(notional: float, fee_bps: float) -> float:
    """Return per-fill fee in dollars for a gross notional.

    Applied symmetrically — the caller sums the entry fee and the
    exit fee to get the round-trip commission. Zero bps returns
    zero dollars.
    """
    if fee_bps <= 0:
        return 0.0
    return float(notional) * fee_bps / 10_000.0


# ─────────────────────────── trailing-stop peak ───────────────────────


def updated_peak(current_peak: float, bar: Bar) -> float:
    """New running peak for trailing-stop tracking.

    Main loop calls this at the TOP of each bar iteration (before
    any evaluator runs) so trailing stops always see the peak as
    of the current bar's high. Monotonic ratchet — never falls.
    """
    return max(float(current_peak), float(bar.high))


# ─────────────────────────── entry context ────────────────────────────


@dataclass(frozen=True)
class EntryContext:
    """Resolved-at-signal-time inputs ``evaluate_entry`` needs.

    Built once per signal bar by the main loop and passed in.
    Keeps the evaluator's signature small and its body pure.
    """

    first_tranche_trigger: Optional[float]  # None iff rule.type == "at_signal"
    first_tranche_pct: float                # fraction of planned position
    first_tranche_index: int = 0
    is_at_signal_rule: bool = True          # first tranche uses at_signal


# ─────────────────────────── evaluate_entry ───────────────────────────


def evaluate_entry(
    bar: Bar,
    ticker: str,
    planned_capital: float,
    ctx: EntryContext,
    signal_set: frozenset[date],
    execution,  # ExecutionConfig — kept untyped to avoid circular import
) -> Optional[FillRecord]:
    """Tranche-1 fill attempt on the signal bar.

    Pure membership check against ``signal_set`` (precomputed by
    the main loop from the pattern detector or custom-expression
    DSL). If ``bar.date`` is in the set, attempts to fill tranche
    1 at the appropriate price:

    - ``is_at_signal_rule`` → fill at ``bar.close`` with
      ``fill_type="signal_close"``. Always succeeds for a sane
      bar; this path does NOT consume the wait cap.
    - Else the first-tranche trigger is checked against the
      signal bar's OHLC. If touched (intraday or gap), fill
      immediately. If NOT touched, returns None — but the main
      loop treats this as a PENDING signal, not a discard, and
      re-checks the trigger via ``evaluate_tranche`` on each
      subsequent bar for up to ``execution.entry_wait_bars``
      bars.

    If the wait cap elapses without a fill, the main loop emits
    a SkippedSignalRecord with reason
    ``"tranche_1_unfilled_within_wait_cap"`` and discards the
    pending signal. ``entry_wait_bars=0`` degrades to the
    skip-on-unfill behavior: the signal bar is the only chance.

    Returns None silently (no log) when the date isn't a signal
    — that's the common path.
    """
    if bar.date not in signal_set:
        return None
    if not _bar_is_sane(bar):
        log.warning("malformed entry bar, skipping", extra={"ticker": ticker, "date": bar.date})
        return None
    if planned_capital <= 0:
        return None

    # Tranche 1 at_signal path — always fills at the bar's close.
    if ctx.is_at_signal_rule:
        fill_price = apply_slippage(bar.close, "buy", execution.slippage_bps)
        fill_type: "FillTypeLiteral" = "signal_close"
    else:
        trigger = ctx.first_tranche_trigger
        if trigger is None:
            return None
        # Gap past trigger — bar opened already above (for long entry
        # via pullback) means we've missed the fill; the main loop
        # handles that by skipping. Gap BELOW trigger means we got a
        # better-than-expected fill at the open.
        if bar.open <= trigger:
            fill_price = apply_slippage(bar.open, "buy", execution.slippage_bps)
            fill_type = "gap_fill"
        elif bar.low <= trigger <= bar.high:
            fill_price = apply_slippage(trigger, "buy", execution.slippage_bps)
            fill_type = "intraday_touch"
        else:
            # Signal bar didn't touch the tranche-1 trigger. Main
            # loop promotes this to a PENDING signal and re-checks
            # via evaluate_tranche for up to execution.entry_wait_bars
            # subsequent bars. See the function docstring.
            return None

    notional_target = planned_capital * ctx.first_tranche_pct
    if fill_price <= 0:
        return None
    shares = notional_target / fill_price
    notional = shares * fill_price
    fee = apply_fee(notional, execution.fee_bps)

    return FillRecord(
        side="entry",
        date=bar.date,
        price=fill_price,
        shares=shares,
        notional=notional,
        fee=fee,
        slippage_applied_bps=execution.slippage_bps,
        fill_type=fill_type,
        leg_index=ctx.first_tranche_index,
        exit_reason=None,
    )


# ─────────────────────────── evaluate_tranche ─────────────────────────


def evaluate_tranche(
    bar: Bar,
    position: PositionState,
    tranche_index: int,
    pct_of_position: float,
    resolved_trigger: float,
    execution,
) -> Optional[FillRecord]:
    """Evaluate ONE unfilled tranche against the current bar.

    Caller iterates ``position.tranche_queue`` in spec order and
    calls this per tranche; the main loop's policy of one-fill-per-
    bar is enforced upstream (caller breaks on first non-None).

    Fill mechanics:
    - ``bar.open <= trigger``: gap-down through the trigger →
      ``gap_fill`` at ``bar.open``.
    - ``bar.low <= trigger <= bar.high``: intraday touch → fill at
      ``trigger`` with ``intraday_touch``.
    - trigger never within range → return None.
    """
    if not _bar_is_sane(bar):
        log.warning("malformed tranche bar, skipping", extra={"ticker": position.ticker, "date": bar.date})
        return None
    if resolved_trigger is None or resolved_trigger <= 0:
        return None
    if pct_of_position <= 0 or position.planned_capital <= 0:
        return None

    # For a long-entry pullback tranche, we want price to come DOWN
    # to the trigger. A bar that opens already at or below the
    # trigger is a gap-down fill.
    if bar.open <= resolved_trigger:
        raw_price = bar.open
        fill_type: "FillTypeLiteral" = "gap_fill"
    elif bar.low <= resolved_trigger <= bar.high:
        raw_price = resolved_trigger
        fill_type = "intraday_touch"
    else:
        return None

    fill_price = apply_slippage(raw_price, "buy", execution.slippage_bps)
    if fill_price <= 0:
        return None
    notional_target = position.planned_capital * pct_of_position
    shares = notional_target / fill_price
    notional = shares * fill_price
    fee = apply_fee(notional, execution.fee_bps)

    return FillRecord(
        side="entry",
        date=bar.date,
        price=fill_price,
        shares=shares,
        notional=notional,
        fee=fee,
        slippage_applied_bps=execution.slippage_bps,
        fill_type=fill_type,
        leg_index=tranche_index,
        exit_reason=None,
    )


# ─────────────────────────── evaluate_tp_legs ─────────────────────────


def evaluate_tp_legs(
    bar: Bar,
    position: PositionState,
    tp_rules_with_resolved_prices: list[tuple[int, float, float]],
    execution,
) -> list[FillRecord]:
    """TP legs that hit during this bar, returned in spec order.

    Each entry in ``tp_rules_with_resolved_prices`` is
    ``(leg_index, pct_of_position, resolved_trigger)``. Caller
    filters out already-fired legs upstream.

    A leg fires when ``bar.high >= trigger``. Fill price is:
    - ``bar.open >= trigger``: gap-up through the TP → gap_fill at
      ``bar.open`` (we got better than the target on the open).
    - else: intraday touch at ``trigger``.

    Sell-side slippage is adverse (subtracts).

    Share count: ``pct_of_position * total_entered_shares``. This
    is the "applied against filled capital, not planned" rule —
    if only 80% of planned filled and a leg is 50% of planned, the
    leg sells 0.5 * (0.8 * total_planned_shares) worth.
    """
    if not _bar_is_sane(bar):
        log.warning("malformed tp bar, skipping", extra={"ticker": position.ticker, "date": bar.date})
        return []
    total_entered_shares = sum(t.shares for t in position.tranches_filled)
    if total_entered_shares <= 0:
        return []

    fills: list[FillRecord] = []
    for leg_index, pct_of_position, trigger in tp_rules_with_resolved_prices:
        if trigger is None or trigger <= 0:
            continue
        if bar.high < trigger:
            continue
        if bar.open >= trigger:
            raw_price = bar.open
            fill_type: "FillTypeLiteral" = "gap_fill"
        else:
            raw_price = trigger
            fill_type = "intraday_touch"
        fill_price = apply_slippage(raw_price, "sell", execution.slippage_bps)
        shares = pct_of_position * total_entered_shares
        notional = shares * fill_price
        fee = apply_fee(notional, execution.fee_bps)
        fills.append(
            FillRecord(
                side="exit",
                date=bar.date,
                price=fill_price,
                shares=shares,
                notional=notional,
                fee=fee,
                slippage_applied_bps=execution.slippage_bps,
                fill_type=fill_type,
                leg_index=leg_index,
                exit_reason="take_profit",
            )
        )
    return fills


# ─────────────────────────── evaluate_stop ────────────────────────────


def evaluate_stop(
    bar: Bar,
    position: PositionState,
    stop_resolved_price: float,
    execution,
) -> Optional[FillRecord]:
    """Stop exit for the position's remaining shares.

    Triggered when ``bar.low <= stop_resolved_price``. Fill price:
    - ``bar.open <= stop``: gap-down through the stop → fill at
      ``bar.open``, fill_type=``gap_fill`` (strategy paid the
      gap).
    - else: intraday touch at ``stop``, fill_type=
      ``intraday_touch``.

    Caller is responsible for having resolved the stop via the
    ResolvedRule — trailing stops should have already folded
    ``position.current_peak`` into the passed-in price.
    """
    if not _bar_is_sane(bar):
        log.warning("malformed stop bar, skipping", extra={"ticker": position.ticker, "date": bar.date})
        return None
    if stop_resolved_price is None or stop_resolved_price <= 0:
        return None

    total_entered_shares = sum(t.shares for t in position.tranches_filled)
    already_exited = sum(e.shares for e in position.exits_taken)
    remaining_shares = max(0.0, total_entered_shares - already_exited)
    if remaining_shares <= 0:
        return None

    if bar.low > stop_resolved_price:
        return None

    if bar.open <= stop_resolved_price:
        raw_price = bar.open
        fill_type: "FillTypeLiteral" = "gap_fill"
    else:
        raw_price = stop_resolved_price
        fill_type = "intraday_touch"

    fill_price = apply_slippage(raw_price, "sell", execution.slippage_bps)
    notional = remaining_shares * fill_price
    fee = apply_fee(notional, execution.fee_bps)
    return FillRecord(
        side="exit",
        date=bar.date,
        price=fill_price,
        shares=remaining_shares,
        notional=notional,
        fee=fee,
        slippage_applied_bps=execution.slippage_bps,
        fill_type=fill_type,
        leg_index=None,
        exit_reason="stop_loss",
    )


# ─────────────────────────── evaluate_time_stop ───────────────────────


def evaluate_time_stop(
    bar: Bar,
    position: PositionState,
    time_stop_days: Optional[int],
    execution,
) -> Optional[FillRecord]:
    """Time-stop exit at ``bar.close``.

    Fires when ``(bar.date - position.entry_date).days >=
    time_stop_days``. ``time_stop_days=None`` disables the rule.
    Fill type is always ``intraday_touch`` because time-stop is
    end-of-day logic — the close IS the fill price by design.
    """
    if time_stop_days is None:
        return None
    if not _bar_is_sane(bar):
        log.warning("malformed time-stop bar, skipping", extra={"ticker": position.ticker, "date": bar.date})
        return None
    if (bar.date - position.entry_date).days < time_stop_days:
        return None

    total_entered_shares = sum(t.shares for t in position.tranches_filled)
    already_exited = sum(e.shares for e in position.exits_taken)
    remaining_shares = max(0.0, total_entered_shares - already_exited)
    if remaining_shares <= 0:
        return None

    fill_price = apply_slippage(bar.close, "sell", execution.slippage_bps)
    if fill_price <= 0:
        return None
    notional = remaining_shares * fill_price
    fee = apply_fee(notional, execution.fee_bps)
    return FillRecord(
        side="exit",
        date=bar.date,
        price=fill_price,
        shares=remaining_shares,
        notional=notional,
        fee=fee,
        slippage_applied_bps=execution.slippage_bps,
        fill_type="intraday_touch",
        leg_index=None,
        exit_reason="time_stop",
    )


# ─────────────────────────── same-bar conflict ────────────────────────


def resolve_same_bar_conflict(
    stop_fill: Optional[FillRecord],
    tp_fills: list[FillRecord],
    priority: Literal["stop", "tp"],
) -> list[FillRecord]:
    """Order the same-bar exits according to ExecutionConfig.same_bar_priority.

    - ``"stop"`` (default): stop wins, every TP on this bar is
      discarded. Returns ``[stop_fill]`` if stop fired, else
      ``tp_fills`` unchanged.
    - ``"tp"``: TPs fire FIRST in spec order; stop fires on any
      residual. The caller applies the returned list in order and
      short-circuits if ``remaining_shares`` hits zero after the
      TPs, so passing the stop through unconditionally here is
      safe — the caller will no-op it if nothing is left to sell.

    ``"time_weighted"`` is reserved on ExecutionConfig but not yet
    a valid value; if it shows up here we fall back to stop-wins
    for safety.
    """
    if stop_fill is None and not tp_fills:
        return []
    if stop_fill is None:
        return list(tp_fills)
    if not tp_fills:
        return [stop_fill]
    if priority == "tp":
        return [*tp_fills, stop_fill]
    # priority == "stop" (or any unknown value — fall through)
    return [stop_fill]


# ─────────────────────────── type helpers ─────────────────────────────
#
# Inline Literal used only inside this module for fill_type
# narrowing — kept at the bottom so the evaluators read
# straight through without jumping to a helper block up top.

FillTypeLiteral = Literal["signal_close", "intraday_touch", "gap_fill", "end_of_data_mark"]


# ─────────────────────────── pending-signal tranche-1 fill ───────────


def _try_tranche_1_fill_pending(
    bar: Bar,
    pending: "_PendingSignal",
    ticker: str,
    execution,
) -> Optional[FillRecord]:
    """Pending-signal specialization of ``evaluate_tranche``.

    The normal evaluator reads ``position.planned_capital`` and
    ``position.ticker`` off a PositionState — but for a pending
    signal no position exists yet (the whole point of the pending
    state). This helper runs the same gap / intraday-touch /
    no-fill logic directly against the cached pre-resolved
    tranche-1 rule on ``_PendingSignal`` and returns a FillRecord
    when tranche-1 fills, None otherwise.

    Resolver exceptions are caught and logged at WARN — a bad
    MA computation or missing anchor should not kill the loop;
    the caller treats the fall-through as "didn't fill today"
    and decrements the wait counter.
    """
    if not _bar_is_sane(bar):
        return None
    if pending.planned_capital <= 0 or pending.tranche_1_pct <= 0:
        return None

    try:
        trigger = pending.tranche_1_rule.price(bar, position=None)
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "pending tranche-1 resolve failed",
            extra={"ticker": ticker, "date": bar.date, "err": str(exc)},
        )
        return None

    if trigger is None or trigger <= 0:
        return None

    if bar.open <= trigger:
        raw_price = bar.open
        fill_type: "FillTypeLiteral" = "gap_fill"
    elif bar.low <= trigger <= bar.high:
        raw_price = trigger
        fill_type = "intraday_touch"
    else:
        return None

    fill_price = apply_slippage(raw_price, "buy", execution.slippage_bps)
    if fill_price <= 0:
        return None

    notional_target = pending.planned_capital * pending.tranche_1_pct
    shares = notional_target / fill_price
    notional = shares * fill_price
    fee = apply_fee(notional, execution.fee_bps)

    return FillRecord(
        side="entry",
        date=bar.date,
        price=fill_price,
        shares=shares,
        notional=notional,
        fee=fee,
        slippage_applied_bps=execution.slippage_bps,
        fill_type=fill_type,
        leg_index=0,
        exit_reason=None,
    )


# ─────────────────────────── result types ─────────────────────────────


@dataclass(frozen=True)
class EquityPoint:
    """Per-bar mark-to-market snapshot of the backtester's account.

    Emitted at the CLOSE of each bar after all fills for that bar
    have been applied. ``equity == cash + positions_value`` by
    construction; the split is carried separately so the equity
    curve can be decomposed (e.g. "how much of the drawdown was
    realized vs. unrealized?").

    Mark-to-market convention: ``positions_value`` uses the bar's
    close for every open position's remaining shares. Realized
    P&L from closed tranches is already baked into ``cash``.
    """

    date: date
    equity: float
    cash: float
    positions_value: float


@dataclass
class BacktestResult:
    """Output of ``run_backtest`` for a single ticker.

    - ``trades``: completed trades (every position that opened is
      closed by the time the function returns; positions still
      open at end-of-data are force-closed with
      ``fill_type="end_of_data_mark"``).
    - ``skipped``: every signal that fired but did NOT produce a
      trade, with a specific reason. Disjoint from ``trades`` —
      the set union equals the full signal set.
    - ``equity_points``: one per bar processed; mark-to-market at
      the close.
    - ``bar_decisions``: per-bar trace of what happened. Only
      populated when ``run_backtest(..., record_decisions=True)`` —
      default is empty to keep memory bounded on long backtests.
    """

    trades: list = field(default_factory=list)
    skipped: list = field(default_factory=list)
    equity_points: list[EquityPoint] = field(default_factory=list)
    bar_decisions: list[tuple[date, BarDecision]] = field(default_factory=list)


# ─────────────────────────── internal: pending signal ────────────────


@dataclass
class _PendingSignal:
    """A signal that fired but hasn't opened its position yet.

    Lives in the main loop's per-ticker state until either (a) the
    tranche-1 trigger is hit on a subsequent bar and the position
    opens, or (b) ``remaining_wait_bars`` reaches zero and the
    signal is discarded with reason
    ``"tranche_1_unfilled_within_wait_cap"``.

    ``tranche_1_rule`` and the full ``tranche_ladder`` + ``tp_legs``
    are ALREADY-RESOLVED at signal time — resolving once freezes
    Wave 1 anchors (and every static fib level below them), which
    is the right semantic for at_fib tranches. Resolving each
    bar would let new pivots shift the anchor, which is wrong.

    ``stop_rule`` is deliberately left unresolved until tranche-1
    actually fills: the stop's initial trailing distance needs
    the real entry_price, which isn't known until the fill lands.
    The main loop resolves the stop on-the-spot when opening the
    position.

    ``planned_capital`` is also frozen at signal time. For
    ``volatility_target`` sizing this is correct by construction
    — the vol estimate only uses bars BEFORE the signal bar, so
    waiting more bars for a fill doesn't change it.
    """

    signal_date: date
    remaining_wait_bars: int
    tranche_1_rule: ResolvedRule
    tranche_1_pct: float
    entry_ctx: EntryContext
    # Cached pre-resolved ladder + TPs + time-stop snapshot + sizing.
    # The stop_rule stays None here — resolved lazily when the fill
    # lands (needs entry_price).
    tranche_ladder: list[tuple[float, ResolvedRule]] = field(default_factory=list)
    tp_legs: list[tuple[float, ResolvedRule, str]] = field(default_factory=list)
    time_stop_days: Optional[int] = None
    planned_capital: float = 0.0
    signal_bar_close: float = 0.0
    signal_bar_idx: int = 0


# ─────────────────────────── signal set builder ──────────────────────


def _build_signal_set(spec, ticker: str, prices) -> frozenset[date]:
    """Run the spec's pattern detector or custom_expression DSL
    and return the set of signal dates as a frozenset.

    Logged at INFO so a low-trade-count backtest is diagnosable
    directly from Railway / CI logs: ``ticker=X signals=N``.

    Never raises — a broken detector or malformed custom
    expression logs an error and returns an empty set so one bad
    ticker can't take down a multi-ticker backtest.
    """
    import pandas as pd

    try:
        if spec.entry.pattern_name is not None:
            from simualpha_quant.research.patterns import by_name

            detector = by_name(spec.entry.pattern_name)
            dates = detector.detect(prices)
        else:
            from simualpha_quant.research import custom_expression

            dates = custom_expression.evaluate_dates(
                spec.entry.custom_expression or {}, prices
            )
    except Exception as exc:  # noqa: BLE001 — don't kill the backtest
        log.error(
            "signal detection failed, treating as zero signals",
            extra={"ticker": ticker, "err": str(exc)},
        )
        return frozenset()

    signal_set = frozenset(pd.Timestamp(d).date() for d in dates)
    log.info(
        "signals detected",
        extra={"ticker": ticker, "signal_count": len(signal_set)},
    )
    return signal_set


# ─────────────────────────── pivot cache ──────────────────────────────


def _detect_pivots_cached(prices):
    """Wave-pivot detection at the timeframe the Stage-3 patterns
    use. Called once per ticker; main loop passes the result into
    the rule resolvers so Wave 1 / Wave 2 anchors don't get
    recomputed on every bar.
    """
    from simualpha_quant.research.waves import (
        detect_pivots,
        sensitivity_for_timeframe,
    )

    sensitivity = sensitivity_for_timeframe("intermediate")
    return detect_pivots(prices["close"], sensitivity=sensitivity)


# ─────────────────────────── rule resolvers ──────────────────────────


def _build_resolve_context(prices, pivots, current_index: int, signal_index: int):
    """Thin wrapper around price_rules.ResolveContext to spare
    callers the import. The dataclass itself has no state beyond
    the four inputs.
    """
    from simualpha_quant.execution.price_rules import ResolveContext

    return ResolveContext(
        prices=prices,
        current_index=current_index,
        signal_index=signal_index,
        pivots=pivots,
    )


def _date_to_index_map(prices) -> dict[date, int]:
    """Map calendar date → integer position in ``prices.index``.

    Built once per ticker; used by market-dynamic resolvers to
    rebuild ResolveContext on each bar via a simple dict lookup
    (O(1)) rather than a DatetimeIndex search (O(log n)).
    """
    import pandas as pd

    return {pd.Timestamp(d).date(): i for i, d in enumerate(prices.index)}


def _resolve_single_rule(
    rule,
    prices,
    pivots,
    signal_idx: int,
    current_idx: int,
    date_idx: dict[date, int],
) -> ResolvedRule:
    """Build a ResolvedRule of the appropriate kind for one PriceRule.

    Dispatches by ``rule.type``:

    - ``at_signal``, ``at_price``, ``at_fib``: resolved ONCE at
      ``current_idx`` and cached as a static float. Wave 1 anchors
      are frozen at signal time, so cached is the correct
      semantic.
    - ``at_ma``: market-dynamic. Returns a ResolvedRule whose
      resolver re-runs ``price_rules.resolve`` against a fresh
      ResolveContext built from the current bar's date. The MA
      value evolves bar-by-bar.

    Raises UnresolvablePriceRule if the initial resolution fails
    (e.g. no Wave 1 formed yet). Caller handles by skipping.
    """
    from simualpha_quant.execution.price_rules import resolve

    if rule.type == "at_ma":
        def resolver(bar, position):  # noqa: ARG001
            idx = date_idx.get(bar.date, current_idx)
            ctx = _build_resolve_context(prices, pivots, idx, signal_idx)
            return resolve(rule, ctx)

        return ResolvedRule.market_dynamic(resolver)

    # Static branch — at_signal / at_price / at_fib.
    ctx = _build_resolve_context(prices, pivots, current_idx, signal_idx)
    price = resolve(rule, ctx)
    return ResolvedRule.static(price)


def _resolve_tranche_ladder(
    spec, prices, signal_idx: int, *, pivots=None, date_idx=None
) -> list[tuple[float, ResolvedRule]]:
    """Resolve every tranche's price_rule at signal time.

    Returns ``(pct_of_position, resolved_rule)`` pairs in spec
    order. Tranche 1 is included — the main loop pulls it off the
    front when building the ``EntryContext``.

    Static rules are cached at ``signal_idx``; ``at_ma`` rules are
    re-resolved each bar via a closure. Rules that fail to resolve
    at signal time raise ``UnresolvablePriceRule`` back to the
    caller, which emits a ``price_rule_unresolvable`` skip.
    """
    if pivots is None:
        pivots = _detect_pivots_cached(prices)
    if date_idx is None:
        date_idx = _date_to_index_map(prices)

    out: list[tuple[float, ResolvedRule]] = []
    for tranche in spec.entry.tranches:
        resolved = _resolve_single_rule(
            tranche.price_rule, prices, pivots, signal_idx, signal_idx, date_idx
        )
        out.append((float(tranche.pct_of_position), resolved))
    return out


def _resolve_tp_legs(
    spec, prices, signal_idx: int, *, pivots=None, date_idx=None
) -> list[tuple[float, ResolvedRule, str]]:
    """Resolve every take-profit leg's price_rule at signal time.

    Returns ``(pct_of_position, resolved_rule, label)`` triples in
    spec order. The label is a short human-readable tag suitable
    for chart annotation (``"TP leg 0 @ 1.618 fib"`` etc.) —
    downstream renderers use it; main loop ignores it.
    """
    if pivots is None:
        pivots = _detect_pivots_cached(prices)
    if date_idx is None:
        date_idx = _date_to_index_map(prices)

    out: list[tuple[float, ResolvedRule, str]] = []
    for idx, leg in enumerate(spec.exit.take_profit):
        resolved = _resolve_single_rule(
            leg.price_rule, prices, pivots, signal_idx, signal_idx, date_idx
        )
        label = _tp_leg_label(idx, leg.price_rule)
        out.append((float(leg.pct_of_position), resolved, label))
    return out


def _tp_leg_label(idx: int, rule) -> str:
    """Short human-readable label for a TP leg."""
    if rule.type == "at_fib":
        return f"TP leg {idx} @ {rule.level:.3f} fib"
    if rule.type == "at_price":
        return f"TP leg {idx} @ ${rule.price:.2f}"
    if rule.type == "at_ma":
        return f"TP leg {idx} @ {rule.freq} SMA({rule.period})"
    return f"TP leg {idx} @ {rule.type}"


def _resolve_stop(
    spec,
    prices,
    signal_idx: int,
    entry_price: float,
    *,
    pivots=None,
    date_idx=None,
) -> Optional[ResolvedRule]:
    """Resolve the stop-loss as a ResolvedRule of the right kind.

    DISPATCH:

    - ``type="hard"`` + static rule (at_signal/at_price/at_fib):
      ResolvedRule.static — the stop price is frozen at entry.
    - ``type="hard"`` + ``at_ma``: ResolvedRule.market_dynamic —
      the MA stop rides the moving average as it evolves.
    - ``type="trailing"``: ResolvedRule.position_dynamic — the
      effective stop = max(initial_stop, current_peak - initial
      distance). Ratchets: never falls below the initial stop,
      rises as current_peak rises.

    TRAILING DISTANCE SEMANTICS (amendment-1 documentation):

    Every currently-supported PriceRule type resolves to an
    ABSOLUTE DOLLAR price — ``at_signal`` = signal bar's close,
    ``at_price`` = literal dollars, ``at_fib`` = anchor-based
    dollars, ``at_ma`` = MA dollar value. So the initial
    trailing-distance is measured in absolute dollars:
    ``initial_distance_dollars = entry_price - initial_stop_price``.
    This is NOT a percentage-below-entry distance.

    If a future PriceRule variant encodes percentage distance
    directly (e.g. a hypothetical ``at_pct_below`` rule), this
    helper should add a branch that inspects ``rule.type`` and
    computes a proportional ratchet:
    ``effective = peak * (1 - initial_pct_below)`` instead of
    ``peak - initial_distance_dollars``. Until that rule exists,
    we keep the dollar-distance semantic explicit — the
    inspection hook is annotated inline below.

    Returns ``None`` when the stop can't resolve at entry (rare —
    typically means no Wave 1 is visible yet for an ``at_fib``
    stop; caller treats as price_rule_unresolvable).
    """
    from simualpha_quant.execution.price_rules import (
        UnresolvablePriceRule,
        resolve,
    )

    if pivots is None:
        pivots = _detect_pivots_cached(prices)
    if date_idx is None:
        date_idx = _date_to_index_map(prices)

    stop_loss = spec.exit.stop_loss
    rule = stop_loss.price_rule

    try:
        ctx_entry = _build_resolve_context(prices, pivots, signal_idx, signal_idx)
        initial_stop = float(resolve(rule, ctx_entry))
    except UnresolvablePriceRule:
        return None
    except Exception as exc:  # noqa: BLE001
        log.warning("stop resolution failed", extra={"err": str(exc)})
        return None

    # Amendment 1 inspection hook. No percent-based rules exist
    # today; add a branch here when one does.
    _distance_metric: Literal["dollars", "percent"] = "dollars"
    if rule.type not in ("at_signal", "at_price", "at_fib", "at_ma"):
        # Defensive: future rule types must be explicitly classified
        # before trailing behavior is trusted.
        log.warning(
            "stop rule.type not recognized for trailing distance classification; "
            "defaulting to dollar-distance",
            extra={"rule_type": rule.type},
        )

    # Hard stop, static rule → frozen dollar price for the trade's life.
    if stop_loss.type == "hard":
        if rule.type == "at_ma":
            def ma_resolver(bar, position):  # noqa: ARG001
                idx = date_idx.get(bar.date, signal_idx)
                ctx = _build_resolve_context(prices, pivots, idx, signal_idx)
                return float(resolve(rule, ctx))

            return ResolvedRule.market_dynamic(ma_resolver)
        return ResolvedRule.static(initial_stop)

    # Trailing stop. Initial distance in absolute dollars.
    initial_distance_dollars = float(entry_price) - initial_stop
    if initial_distance_dollars <= 0:
        # Stop at-or-above entry is degenerate for a long trailing
        # stop; fall back to a static hard stop at the initial
        # resolved price rather than build a ratchet that would
        # fire immediately.
        log.warning(
            "trailing stop resolved at-or-above entry price; "
            "degrading to static hard stop",
            extra={"entry_price": entry_price, "initial_stop": initial_stop},
        )
        return ResolvedRule.static(initial_stop)

    def trailing_resolver(bar, position):  # noqa: ARG001
        if position is None:
            return initial_stop
        ratcheted = position.current_peak - initial_distance_dollars
        return max(initial_stop, ratcheted)

    return ResolvedRule.position_dynamic(trailing_resolver)


# ─────────────────────────── invariants ───────────────────────────────


class BacktesterInvariantError(RuntimeError):
    """Internal consistency violation.

    Raised when a ``_close_and_emit_trade`` / ``_open_position`` call
    detects state that should be impossible — e.g. exit shares
    exceed entry shares, an entry_fill with ``side != "entry"``, or
    a closed position with no filled tranches. Always indicates a
    bug in the backtester's own bookkeeping, never a user-strategy
    issue. Should never fire in production; tests assert against it
    to catch regressions.
    """


# ─────────────────────────── sizing helper ────────────────────────────


def _base_capital_per_position(spec) -> float:
    """``initial_capital / max_open_positions``. The reference budget
    that the non-``fixed`` sizing methods scale against.
    """
    if spec.max_open_positions <= 0:
        return float(spec.initial_capital)
    return float(spec.initial_capital) / float(spec.max_open_positions)


def _realized_volatility(prices, signal_idx: int, lookback_days: int) -> Optional[float]:
    """Annualized realized volatility of log returns over the
    ``lookback_days`` bars ending at ``signal_idx - 1`` (strictly
    BEFORE the signal bar so the backtest doesn't peek at its own
    entry-bar return).

    Returns None when there isn't enough history or the sample
    std is zero / NaN. Caller treats that as "degrade to base
    per-position capital with a warning."
    """
    import numpy as np

    # Use bars strictly before the signal bar for the volatility
    # estimate — point-in-time correctness.
    end = signal_idx
    start = end - lookback_days
    if start < 1:
        # Need at least one bar before `start` so we can compute
        # log return for the first sampled return.
        return None

    close = prices["close"].iloc[start - 1 : end].to_numpy(dtype=float)
    if len(close) < 2:
        return None
    if np.any(close <= 0) or np.any(~np.isfinite(close)):
        return None

    log_returns = np.log(close[1:] / close[:-1])
    if len(log_returns) < 2:
        return None
    sample_std = float(np.std(log_returns, ddof=1))
    if not np.isfinite(sample_std) or sample_std <= 0:
        return None
    return sample_std * (252.0 ** 0.5)


def _planned_capital_for(
    spec,
    *,
    prices=None,
    signal_idx: Optional[int] = None,
) -> float:
    """Per-position planned-total USD stake.

    Three sizing methods, all Stage-4-approved:

    **fixed** — ``params.stake_usd`` verbatim. Ignores prices/
    signal_idx. The simplest case: every position gets the same
    dollar budget regardless of volatility or edge.

    **volatility_target** — scale the base per-position budget
    inversely with realized volatility. Reads the following from
    ``params``:

      target_volatility          required, annualized (e.g. 0.15)
      lookback_days              default 60, bars of history
      max_leverage_multiplier    default 2.0, cap on scale-up
      min_size_fraction          default 0.1, floor on scale-down

    Formula::

        base   = initial_capital / max_open_positions
        σ_R    = std(log returns over lookback_days bars BEFORE signal) × √252
        mult   = clamp(target_volatility / σ_R,
                       min_size_fraction, max_leverage_multiplier)
        planned = base × mult

    Using bars STRICTLY BEFORE the signal bar is point-in-time
    correct — no lookahead into the entry day's move. When fewer
    than ``lookback_days + 1`` bars of history are available the
    formula degrades to ``base`` with a WARN log; this lets early-
    in-window signals still open positions at a reasonable size
    instead of being silently skipped.

    **kelly_fraction** — naive Kelly, matching the documented DSL
    behavior. Reads ``params.kelly_fraction`` (e.g. 0.25 for
    quarter-Kelly) and returns ``base × kelly_fraction``. No
    edge estimation inside the loop — the caller / OpenClaw is
    responsible for producing a defensible fraction. Matches the
    approved-Stage-4 decision: edge estimation is NOT the
    backtester's job.

    When ``prices`` or ``signal_idx`` are omitted for a sizing
    method that needs them, the helper degrades gracefully to
    ``base`` with a warning so a backtest never crashes on a
    sizing knob.
    """
    method = spec.position_sizing.method
    params = spec.position_sizing.params

    if method == "fixed":
        return float(params["stake_usd"])

    base = _base_capital_per_position(spec)

    if method == "kelly_fraction":
        kf = float(params["kelly_fraction"])
        return base * kf

    if method == "volatility_target":
        if prices is None or signal_idx is None:
            log.warning(
                "volatility_target sizing called without prices/signal_idx; "
                "degrading to base per-position capital",
            )
            return base

        target_vol = float(params["target_volatility"])
        lookback_days = int(params.get("lookback_days", 60))
        max_lev = float(params.get("max_leverage_multiplier", 2.0))
        min_size = float(params.get("min_size_fraction", 0.1))

        realized = _realized_volatility(prices, signal_idx, lookback_days)
        if realized is None:
            log.warning(
                "volatility_target: insufficient history for realized-vol estimate; "
                "degrading to base per-position capital",
                extra={"signal_idx": signal_idx, "lookback_days": lookback_days},
            )
            return base

        raw_mult = target_vol / realized
        mult = max(min_size, min(max_lev, raw_mult))
        return base * mult

    # Unknown method: conservative fallback. Schema should have
    # rejected this already.
    log.warning("unknown sizing method, using base capital", extra={"method": method})
    return base


# ─────────────────────────── _open_position ───────────────────────────


def _open_position(
    signal_date: date,
    bar: Bar,
    tranche_ladder: list[tuple[float, ResolvedRule]],
    tp_legs: list[tuple[float, ResolvedRule, str]],
    stop_rule: Optional[ResolvedRule],
    time_stop_days: Optional[int],
    planned_capital: float,
    entry_fill,
    ticker: str,
) -> PositionState:
    """Construct a fresh PositionState after tranche-1 has filled.

    Inputs:
      signal_date        — date the entry signal fired (may ≠ entry_fill.date
                           when wait-for-fill promoted the signal and
                           tranche-1 filled on a later bar).
      bar                — the bar on which tranche-1 filled.
      tranche_ladder     — full (pct, ResolvedRule) list from
                           _resolve_tranche_ladder; INCLUDES tranche 1.
                           Index 0 is assumed already filled via
                           entry_fill; the remainder populates
                           tranche_queue.
      tp_legs            — full (pct, ResolvedRule, label) list from
                           _resolve_tp_legs. Labels are dropped in the
                           queue (they're for chart annotation only).
      stop_rule          — already-resolved stop (static/dynamic/
                           trailing). None when the spec's stop could
                           not resolve at entry; caller handles that
                           edge case upstream.
      time_stop_days     — as on spec.exit, may be None.
      planned_capital    — per-position USD budget, pre-computed by
                           the main loop via ``_planned_capital_for``.
                           Sizing logic lives there, not here — this
                           helper stays agnostic to sizing methods.
      entry_fill         — the completed tranche-1 FillRecord.
      ticker             — for PositionState.ticker and error messages.

    Output: PositionState ready for the main loop to iterate.

    Caller owns: logging the open, appending to the open-positions
    tracker, and recording a BarDecision.ENTRY in the trace.
    """
    if entry_fill.side != "entry":
        raise BacktesterInvariantError(
            f"_open_position: entry_fill.side must be 'entry', got "
            f"{entry_fill.side!r} (ticker={ticker})"
        )
    if entry_fill.shares <= 0:
        raise BacktesterInvariantError(
            f"_open_position: entry_fill.shares must be positive, got "
            f"{entry_fill.shares} (ticker={ticker})"
        )
    if planned_capital <= 0:
        raise BacktesterInvariantError(
            f"_open_position: planned_capital must be positive, got "
            f"{planned_capital} (ticker={ticker})"
        )

    # Tranche 1 (index 0) already filled via entry_fill. Remaining
    # tranches are the tail of the ladder, tagged with their spec
    # indices so main-loop logs / skipped-signal records can
    # reference them by number.
    remaining_tranches: list[tuple[int, float, ResolvedRule]] = [
        (i, pct, rule)
        for i, (pct, rule) in enumerate(tranche_ladder)
        if i > 0
    ]
    tp_queue: list[tuple[int, float, ResolvedRule]] = [
        (i, pct, rule) for i, (pct, rule, _label) in enumerate(tp_legs)
    ]

    # current_peak seeded at max(entry_fill.price, bar.high). Using
    # entry_fill.price covers the gap_fill case where bar.open is
    # above bar.high would never happen but bar.high might be below
    # a slippage-adjusted entry price in a degenerate bar. The max
    # over both is always a valid "seen so far" mark.
    seeded_peak = max(float(entry_fill.price), float(bar.high))

    return PositionState(
        ticker=ticker,
        planned_capital=planned_capital,
        entry_date=entry_fill.date,
        entry_signal_date=signal_date,
        entry_signal_close=float(bar.close),
        filled_capital=float(entry_fill.notional),
        tranches_filled=[entry_fill],
        exits_taken=[],
        tranche_queue=remaining_tranches,
        tp_queue=tp_queue,
        stop_rule=stop_rule,
        time_stop_days=time_stop_days,
        current_peak=seeded_peak,
    )


# ─────────────────────────── _close_and_emit_trade ────────────────────


def _weighted_avg_price(fills: list) -> Optional[float]:
    """Volume-weighted average fill price. None when no fills or
    total shares is zero (degenerate; caller handles)."""
    total_shares = sum(f.shares for f in fills)
    if total_shares <= 0:
        return None
    total_notional = sum(f.notional for f in fills)
    return total_notional / total_shares


def _close_and_emit_trade(
    position: PositionState,
    last_bar: Bar,
    ctx=None,
):
    """Transform a closed PositionState into a TradeRecord.

    Called in two scenarios:

    1. The position's ``remaining_pct`` has hit 0 — every entered
       share has an offsetting exit.
    2. End-of-data force-close — the last bar of the date range
       reached while the position was still open. The main loop
       appends a synthetic ``end_of_data_mark`` fill for the
       residual before calling this, so from here it looks like
       case (1).

    Returns a TradeRecord carrying:

      ticker, entry_date, exit_date  — exit_date is the latest exit
                                       FillRecord's date, or
                                       last_bar.date if the caller
                                       passed us a position with no
                                       exits (bug, raises).
      entry_price, exit_price        — volume-weighted averages.
      pct_return                     — NET of fees and slippage.
                                       Slippage is already baked
                                       into fill prices
                                       (apply_slippage adjusts the
                                       price before shares/notional
                                       are computed). Fees are
                                       subtracted explicitly:
                                         cost_basis = entry_notional
                                                      + entry_fees
                                         proceeds   = exit_notional
                                                      - exit_fees
                                         pct_return = (proceeds -
                                                       cost_basis) /
                                                      cost_basis
                                       A half-filled position's
                                       pct_return is therefore
                                       measured against the
                                       ACTUAL DEPLOYED capital
                                       (cost_basis), not the
                                       planned capital — which is
                                       what the user amendment
                                       calls for.
      planned_capital, filled_capital — copied from position.
      fills                          — entries + exits, in bar order.
      tranche_entries (legacy)       — (date, price, pct_of_planned)
                                       tuples kept for the existing
                                       chart-annotation code.
      exit_reason                    — the final exit fill's reason.
      holding_duration_days          — calendar days entry→exit.
      context                        — ctx argument if it's a
                                       TradeContext, else None.
                                       The existing
                                       enrich_trades_with_context
                                       pass can still fill this
                                       post-hoc if ctx was None
                                       here.

    Pure transformation. One DEBUG-level log; no other side
    effects.
    """
    if not position.tranches_filled:
        raise BacktesterInvariantError(
            f"_close_and_emit_trade: {position.ticker} position has no "
            f"filled tranches — _open_position should have rejected this"
        )

    total_entered_shares = sum(t.shares for t in position.tranches_filled)
    total_exited_shares = sum(e.shares for e in position.exits_taken)

    if total_entered_shares <= 0:
        raise BacktesterInvariantError(
            f"_close_and_emit_trade: {position.ticker} has zero entry shares "
            f"despite {len(position.tranches_filled)} fill records"
        )

    # Allow a hair of floating-point slack when checking the
    # exits-don't-exceed-entries invariant.
    share_slack = max(total_entered_shares * 1e-9, 1e-9)
    if total_exited_shares > total_entered_shares + share_slack:
        raise BacktesterInvariantError(
            f"_close_and_emit_trade: {position.ticker} exited "
            f"{total_exited_shares:.6f} shares but only entered "
            f"{total_entered_shares:.6f}"
        )

    entry_notional = sum(f.notional for f in position.tranches_filled)
    entry_fee_total = sum(f.fee for f in position.tranches_filled)
    exit_notional = sum(f.notional for f in position.exits_taken)
    exit_fee_total = sum(f.fee for f in position.exits_taken)

    avg_entry = _weighted_avg_price(position.tranches_filled)
    avg_exit = _weighted_avg_price(position.exits_taken)

    cost_basis = entry_notional + entry_fee_total
    proceeds = exit_notional - exit_fee_total
    pct_return = (proceeds - cost_basis) / cost_basis if cost_basis > 0 else 0.0

    if position.exits_taken:
        exit_date_: Optional[date] = max(f.date for f in position.exits_taken)
        final_exit_reason = position.exits_taken[-1].exit_reason
    else:
        # Caller didn't append the force-close fill — treat as
        # end-of-data mark for reporting but flag it with a log.
        exit_date_ = last_bar.date
        final_exit_reason = None
        log.warning(
            "closing trade with no exit fills; emitting with exit_date=last_bar",
            extra={"ticker": position.ticker, "entry_date": position.entry_date},
        )

    holding_duration_days: Optional[int] = (
        (exit_date_ - position.entry_date).days if exit_date_ is not None else None
    )

    # Legacy tranche_entries shape for chart-annotation back-compat.
    # pct_of_planned_position = fill_notional / planned_capital
    # (clamped at [0, 1] — a fill can't legitimately exceed planned).
    tranche_entries_legacy: list[tuple[date, float, float]] = []
    for f in position.tranches_filled:
        if position.planned_capital > 0:
            pct = min(1.0, max(0.0, f.notional / position.planned_capital))
        else:
            pct = 0.0
        tranche_entries_legacy.append((f.date, float(f.price), pct))

    all_fills = list(position.tranches_filled) + list(position.exits_taken)

    # ctx passthrough. Only accept TradeContext-shaped objects;
    # anything else is ignored and left for enrich_trades_with_context
    # to fill post-hoc. Import deferred so the backtester module can
    # be used without the full execution package installed.
    if ctx is not None:
        from simualpha_quant.execution.trade_log import TradeContext

        context_attached = ctx if isinstance(ctx, TradeContext) else None
    else:
        context_attached = None

    from simualpha_quant.execution.trade_log import TradeRecord

    log.debug(
        "trade closed",
        extra={
            "ticker": position.ticker,
            "entry_date": position.entry_date,
            "exit_date": exit_date_,
            "pct_return": pct_return,
            "planned_capital": position.planned_capital,
            "filled_capital": position.filled_capital,
            "final_exit_reason": final_exit_reason,
            "holding_duration_days": holding_duration_days,
        },
    )

    return TradeRecord(
        ticker=position.ticker,
        entry_date=position.entry_date,
        exit_date=exit_date_,
        entry_price=float(avg_entry) if avg_entry is not None else 0.0,
        exit_price=float(avg_exit) if avg_exit is not None else None,
        pct_return=float(pct_return),
        planned_capital=float(position.planned_capital),
        filled_capital=float(position.filled_capital),
        fills=all_fills,
        tranche_entries=tranche_entries_legacy,
        context=context_attached,
        exit_reason=final_exit_reason,
        holding_duration_days=holding_duration_days,
    )


# ─────────────────────────── bar row → Bar helper ─────────────────────


def _row_to_bar(prices, bar_idx: int) -> Bar:
    """Pull one OHLCV row out of a prices DataFrame by position.

    Fails loud on missing columns — callers (primarily
    ``run_backtest``) have already validated the DataFrame's
    column set upfront, so a missing column here is a bug.

    The frame's index supplies the date. Pandas Timestamps are
    converted to native ``datetime.date`` so downstream primitives
    compare cleanly against ``signal_set`` (which is a frozenset
    of ``date``).
    """
    import pandas as pd

    row = prices.iloc[bar_idx]
    raw_date = prices.index[bar_idx]
    bar_date = pd.Timestamp(raw_date).date()
    return Bar(
        date=bar_date,
        open=float(row["open"]),
        high=float(row["high"]),
        low=float(row["low"]),
        close=float(row["close"]),
        volume=float(row["volume"]),
    )


# ─────────────────────────── run_backtest ─────────────────────────────


_REQUIRED_PRICE_COLUMNS = ("open", "high", "low", "close", "volume")


def run_backtest(
    spec,
    ticker: str,
    prices,
    *,
    initial_capital: float = 100_000.0,
    record_decisions: bool = False,
    ctx_hook: Optional[Callable[["Bar", "PositionState"], dict]] = None,
) -> BacktestResult:
    """Run the single-ticker equity backtester end-to-end.

    Iterates ``prices`` chronologically, detects entry signals via
    the pattern detector or DSL encoded in ``spec.entry``, opens
    at most one position at a time against this ticker, manages
    the tranche ladder + TP legs + stop + time stop as bars
    arrive, and force-closes at end-of-data with
    ``fill_type="end_of_data_mark"`` if anything remains open.

    ASSUMPTIONS (violations raise ``ValueError`` — bad data is a
    caller bug, not a runtime fallback):

    - ``prices`` is a pandas DataFrame with columns
      ``open, high, low, close, volume``.
    - Index is a DatetimeIndex (or anything Timestamp-parseable),
      sorted ascending, with no duplicate dates.
    - Prices are split- and dividend-adjusted (the module
      docstring's contract).

    Parameters
    ----------
    spec : StrategySpec
        Fully-validated strategy; execution knobs read from
        ``spec.execution``.
    ticker : str
        Symbol this run is operating on. Used only for logging
        and the emitted records — the helper does not fetch
        prices.
    prices : pandas.DataFrame
        The price frame described above.
    initial_capital : float, default 100_000
        Starting cash for the equity curve. Per-position sizing
        is handled separately via ``spec.position_sizing``.
    record_decisions : bool, default False
        Enable the per-bar ``BarDecision`` trace on the
        returned ``BacktestResult``. Off by default because
        it's O(n_bars) memory that only a debugger / OpenClaw
        post-mortem needs.
    ctx_hook : callable or None
        Optional hook invoked at trade-close time to attach a
        chart / analytics context dict. Signature
        ``(bar, position) -> dict``. Reserved for Stage 4.5
        chart threading; unused here in 3a-iii-A.

    Returns
    -------
    BacktestResult
        Trades (fully-closed including end-of-data mark), skipped
        signals, per-bar equity points, and the opt-in
        bar-decision trace.

    Notes
    -----
    The loop body is assembled across 3a-iii-A (shell + peak
    ratcheting), 3a-iii-B (signal processing + entry),
    3a-iii-C (tranche adds + exits + trade emission), and
    3a-iii-D (equity marking + end-of-data force-close). THIS
    commit ships the shell only — sections 2b through 2g are
    deliberately stubbed.
    """
    import pandas as pd

    # ─── SECTION 1: input validation ────────────────────────────────

    if not hasattr(prices, "columns") or not hasattr(prices, "index"):
        raise ValueError(
            f"run_backtest({ticker}): prices must be a pandas DataFrame"
        )
    missing = [c for c in _REQUIRED_PRICE_COLUMNS if c not in prices.columns]
    if missing:
        raise ValueError(
            f"run_backtest({ticker}): prices missing required columns: {missing}"
        )
    if len(prices) == 0:
        raise ValueError(f"run_backtest({ticker}): prices is empty")

    # Index must be Timestamp-parseable and sorted ascending with no
    # duplicates. We don't insist on a DatetimeIndex specifically so
    # ticker fixtures using a `date` column set as index also work.
    try:
        parsed_index = pd.DatetimeIndex(prices.index)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(
            f"run_backtest({ticker}): prices index cannot be parsed as "
            f"DatetimeIndex: {exc}"
        ) from exc
    if not parsed_index.is_monotonic_increasing:
        raise ValueError(
            f"run_backtest({ticker}): prices index must be sorted ascending"
        )
    if parsed_index.has_duplicates:
        dupes = parsed_index[parsed_index.duplicated()]
        raise ValueError(
            f"run_backtest({ticker}): prices index has duplicate dates: "
            f"{list(dupes[:5])}{' ...' if len(dupes) > 5 else ''}"
        )

    # ─── SECTION 1: signal-set + date-index precomputation ──────────

    signal_dates = _build_signal_set(spec, ticker, prices)
    date_idx = _date_to_index_map(prices)
    # Pivots computed once per ticker so _resolve_*_{ladder,tp_legs,stop}
    # and the pending-signal rechecks all share the same anchor set.
    pivots = _detect_pivots_cached(prices)

    # ─── SECTION 1: loop state initialization ───────────────────────

    open_position: Optional[PositionState] = None
    pending_signals: list[_PendingSignal] = []
    trades: list = []
    skipped: list = []
    equity_points: list[EquityPoint] = []
    bar_decisions: list[tuple[date, BarDecision]] = []

    # Cash / realized-P&L accounting is filled in by 3a-iii-D
    # alongside the equity-point emission. Kept in scope here so the
    # main loop's state surface is explicit from the top.
    cash: float = float(initial_capital)
    realized_pnl: float = 0.0

    log.info(
        "backtest start",
        extra={
            "ticker": ticker,
            "signal_count": len(signal_dates),
            "bars": len(prices),
            "window_start": str(parsed_index[0].date()),
            "window_end": str(parsed_index[-1].date()),
            "initial_capital": initial_capital,
        },
    )

    # ─── SECTION 2: per-bar iteration ──────────────────────────────

    for bar_idx in range(len(prices)):
        bar = _row_to_bar(prices, bar_idx)

        # ─── SECTION 2-PRE: bar sanity check ───────────────────────

        if not _bar_is_sane(bar):
            log.warning(
                "malformed bar, skipping",
                extra={"ticker": ticker, "bar_idx": bar_idx, "date": bar.date},
            )
            if record_decisions:
                bar_decisions.append((bar.date, BarDecision.SKIP))
            continue

        # ─── SECTION 2a: update current_peak on open position ──────

        if open_position is not None:
            open_position.current_peak = updated_peak(
                open_position.current_peak, bar
            )

        # ─── SECTION 2b: process pending signals ───────────────────
        #
        # Each pending signal gets exactly ONE chance per bar:
        # either tranche-1 fills and the signal is promoted to an
        # open position, or the wait counter decrements and the
        # signal lives to see tomorrow (unless it hit zero, in
        # which case it's emitted as a
        # tranche_1_unfilled_within_wait_cap skip).
        #
        # Mutually exclusive by construction: a pending signal
        # that filled is processed (promoted or blocked); a
        # pending signal that didn't fill is decremented. A single
        # bar never both fills AND expires a pending.
        #
        # TODO(3a-iii-batch): when multiple pendings fill on the
        # same bar and open_position is None, the first one wins
        # in list order (effectively signal_date ascending since
        # we append in order). Subsequent same-bar fills get
        # same_ticker_already_open. Consider whether "earliest
        # signal wins" is the right tie-breaker or if something
        # else (e.g. "closest to trigger wins") would be more
        # principled. Resolve before 3b.

        if pending_signals:
            still_pending: list[_PendingSignal] = []
            for pending in pending_signals:
                fill = _try_tranche_1_fill_pending(
                    bar, pending, ticker, spec.execution
                )

                if fill is None:
                    # No fill this bar — decrement or expire.
                    pending.remaining_wait_bars -= 1
                    if pending.remaining_wait_bars <= 0:
                        skipped.append(
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
                        # Drop — do not re-add to still_pending.
                    else:
                        still_pending.append(pending)
                    continue

                # Fill landed. If the slot is already taken (either
                # another signal earlier in this bar or a position
                # that was never closed), emit a same-ticker skip
                # and drop the pending.
                if open_position is not None:
                    skipped.append(
                        SkippedSignalRecord(
                            ticker=ticker,
                            signal_date=pending.signal_date,
                            reason="same_ticker_already_open",
                            detail=(
                                "pending tranche-1 fill blocked by "
                                f"open position entered "
                                f"{open_position.entry_date}"
                            ),
                        )
                    )
                    continue  # drop

                # Slot open — resolve the stop now that we know
                # the actual entry_price, then open the position.
                stop_rule = _resolve_stop(
                    spec,
                    prices,
                    pending.signal_bar_idx,
                    fill.price,
                    pivots=pivots,
                    date_idx=date_idx,
                )
                if stop_rule is None:
                    skipped.append(
                        SkippedSignalRecord(
                            ticker=ticker,
                            signal_date=pending.signal_date,
                            reason="price_rule_unresolvable",
                            detail="stop rule could not resolve at fill time",
                        )
                    )
                    continue  # drop

                try:
                    open_position = _open_position(
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
                except BacktesterInvariantError as exc:
                    # Shouldn't happen — _try_tranche_1_fill_pending
                    # already guards the fill shape. Log and drop.
                    log.error(
                        "invariant violated opening pending signal",
                        extra={
                            "ticker": ticker,
                            "signal_date": pending.signal_date,
                            "err": str(exc),
                        },
                    )
                    continue  # drop
                if record_decisions:
                    bar_decisions.append((bar.date, BarDecision.ENTRY))
                # Drop from pending — don't re-add to still_pending.

            pending_signals = still_pending

        # ─── SECTION 2c: check for new signal on this bar ──────────
        #
        # A signal on this bar: resolve rules at signal-idx (freezes
        # anchors), try tranche-1 fill via evaluate_entry, either
        # promote to open_position or push a _PendingSignal onto the
        # queue for the wait window.

        if bar.date in signal_dates:
            if open_position is not None:
                skipped.append(
                    SkippedSignalRecord(
                        ticker=ticker,
                        signal_date=bar.date,
                        reason="same_ticker_already_open",
                        detail=(
                            f"position opened on "
                            f"{open_position.entry_date} still active"
                        ),
                    )
                )
                continue  # back to loop top

            # Resolve full ladder + TPs at signal bar. The stop is
            # left unresolved until entry_price is known (either
            # here on immediate fill or later when a pending fills).
            from simualpha_quant.execution.price_rules import (
                UnresolvablePriceRule,
            )

            try:
                tranche_ladder = _resolve_tranche_ladder(
                    spec, prices, bar_idx, pivots=pivots, date_idx=date_idx
                )
                tp_legs = _resolve_tp_legs(
                    spec, prices, bar_idx, pivots=pivots, date_idx=date_idx
                )
            except UnresolvablePriceRule as exc:
                skipped.append(
                    SkippedSignalRecord(
                        ticker=ticker,
                        signal_date=bar.date,
                        reason="price_rule_unresolvable",
                        detail=f"ladder/TPs: {exc}",
                    )
                )
                continue
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "rule resolution errored at signal",
                    extra={"ticker": ticker, "date": bar.date, "err": str(exc)},
                )
                skipped.append(
                    SkippedSignalRecord(
                        ticker=ticker,
                        signal_date=bar.date,
                        reason="price_rule_unresolvable",
                        detail=str(exc),
                    )
                )
                continue

            planned_capital = _planned_capital_for(
                spec, prices=prices, signal_idx=bar_idx
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
                signal_set=frozenset([bar.date]),
                execution=spec.execution,
            )

            if entry_fill is not None:
                # Immediate fill — resolve the stop against the real
                # entry price and open the position.
                stop_rule = _resolve_stop(
                    spec,
                    prices,
                    bar_idx,
                    entry_fill.price,
                    pivots=pivots,
                    date_idx=date_idx,
                )
                if stop_rule is None:
                    skipped.append(
                        SkippedSignalRecord(
                            ticker=ticker,
                            signal_date=bar.date,
                            reason="price_rule_unresolvable",
                            detail="stop rule unresolvable at entry",
                        )
                    )
                    continue

                try:
                    open_position = _open_position(
                        signal_date=bar.date,
                        bar=bar,
                        tranche_ladder=tranche_ladder,
                        tp_legs=tp_legs,
                        stop_rule=stop_rule,
                        time_stop_days=spec.exit.time_stop_days,
                        planned_capital=planned_capital,
                        entry_fill=entry_fill,
                        ticker=ticker,
                    )
                except BacktesterInvariantError as exc:
                    log.error(
                        "invariant violated opening new signal",
                        extra={
                            "ticker": ticker,
                            "signal_date": bar.date,
                            "err": str(exc),
                        },
                    )
                    skipped.append(
                        SkippedSignalRecord(
                            ticker=ticker,
                            signal_date=bar.date,
                            reason="price_rule_unresolvable",
                            detail=f"invariant: {exc}",
                        )
                    )
                    continue
                if record_decisions:
                    bar_decisions.append((bar.date, BarDecision.ENTRY))
            else:
                # Tranche-1 didn't fill on the signal bar. Either
                # skip immediately (wait_bars=0 "skip-on-unfill")
                # or push onto the pending queue.
                if spec.execution.entry_wait_bars == 0:
                    skipped.append(
                        SkippedSignalRecord(
                            ticker=ticker,
                            signal_date=bar.date,
                            reason="tranche_1_unfilled_within_wait_cap",
                            detail="entry_wait_bars=0, no grace period",
                        )
                    )
                else:
                    pending_signals.append(
                        _PendingSignal(
                            signal_date=bar.date,
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

        # ─── SECTION 2d: check open position for tranche adds ──────
        # TODO(3a-iii-C): iterate tranche_queue in spec order,
        # evaluate_tranche, first fill wins for this bar.

        # ─── SECTION 2e: check open position for exits ─────────────
        # TODO(3a-iii-C): resolve stop + tp prices for this bar;
        # evaluate_stop / evaluate_tp_legs / evaluate_time_stop;
        # resolve_same_bar_conflict; apply exits; close position
        # and emit trade when remaining_pct hits zero.

        # ─── SECTION 2f: mark-to-market equity point ───────────────
        # TODO(3a-iii-D): compute cash + positions_value and emit
        # an EquityPoint for this bar.

        # ─── SECTION 2g: bar decisions trace ───────────────────────
        # TODO(3a-iii-B/C): record_decisions-gated append of the
        # dominant BarDecision for this bar (currently only SKIP
        # on malformed bars, above).

    # ─── SECTION 3: end-of-data force-close ────────────────────────
    # TODO(3a-iii-D): if open_position is not None, synthesize an
    # end_of_data_mark fill at the last bar's close, apply it,
    # and emit the final trade.

    # ─── SECTION 4: return ─────────────────────────────────────────

    log.info(
        "backtest done",
        extra={
            "ticker": ticker,
            "trades": len(trades),
            "skipped": len(skipped),
            "equity_points": len(equity_points),
        },
    )
    return BacktestResult(
        trades=trades,
        skipped=skipped,
        equity_points=equity_points,
        bar_decisions=bar_decisions,
    )
