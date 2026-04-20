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
    """Tranche-1 fill at the signal bar.

    Pure membership check against ``signal_set`` (precomputed by
    the main loop from the pattern detector or custom-expression
    DSL). If ``bar.date`` is in the set, attempts to fill tranche
    1 at the appropriate price:

    - ``is_at_signal_rule`` → fill at ``bar.close``, fill_type=
      ``"signal_close"``.
    - Else the first-tranche trigger must be touched on the signal
      bar itself (intraday or gap). If not touched, returns None
      and the main loop records a skipped_signal with reason
      ``"price_rule_unresolvable"``.

    Returns None silently (no warn) when the date isn't a signal —
    that's the common path.
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
            # Signal fired but the price never reached the tranche-1
            # trigger on the signal bar. TODO: support wait-for-fill
            # across subsequent bars — for now the main loop skips.
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

FillTypeLiteral = Literal["signal_close", "intraday_touch", "gap_fill"]
