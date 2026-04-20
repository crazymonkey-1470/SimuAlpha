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
