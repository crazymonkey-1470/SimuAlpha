"""Resolve a ``PriceRule`` against a bar-level context.

Called by the freqtrade adapter for every tranche / exit / stop
decision the simulator makes at each bar. Pure-Python, no freqtrade
dependency — keeps this hot path testable without installing the
Stage-4 extras.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from simualpha_quant.research.fibonacci import wave_1_retracement_levels
from simualpha_quant.research.patterns._base import (
    monthly_sma_aligned,
    sma,
    weekly_sma_aligned,
)
from simualpha_quant.research.waves import Pivot, find_developing_wave_2
from simualpha_quant.schemas.strategy import PriceRule


@dataclass(frozen=True)
class ResolveContext:
    """State snapshot the resolver needs at a given bar.

    Attributes:
        prices: daily OHLCV for this ticker, ascending DatetimeIndex.
        current_index: integer position in ``prices.index`` of the bar
            under evaluation.
        signal_index: integer position of the entry-signal bar. Used by
            ``at_signal``.
        pivots: the full pivot list for this ticker (detected once,
            reused across all resolves for this backtest).
    """
    prices: pd.DataFrame
    current_index: int
    signal_index: int
    pivots: list[Pivot]

    @property
    def current_date(self):
        return self.prices.index[self.current_index]

    @property
    def signal_close(self) -> float:
        return float(self.prices["close"].iloc[self.signal_index])

    @property
    def current_close(self) -> float:
        return float(self.prices["close"].iloc[self.current_index])


class UnresolvablePriceRule(ValueError):
    """Raised when a rule can't yet resolve (e.g. MA still warming up
    or no Wave 1 anchors visible). The caller should skip this bar."""


def _wave_1_anchors(ctx: ResolveContext) -> tuple[Pivot, Pivot]:
    """Most-recent developing-Wave-2 anchors at ``ctx.current_index``.

    Raises ``UnresolvablePriceRule`` if no Wave 1 has formed yet.
    """
    relevant = [p for p in ctx.pivots if p.index <= ctx.current_index]
    dev = find_developing_wave_2(relevant)
    if not dev:
        raise UnresolvablePriceRule("no developing Wave-2 anchors yet")
    # Use the most recent triple.
    return dev[-1][0], dev[-1][1]


def resolve(rule: PriceRule, ctx: ResolveContext) -> float:
    """Return the concrete dollar price for ``rule`` at ``ctx``."""
    if rule.type == "at_signal":
        return ctx.signal_close

    if rule.type == "at_price":
        assert rule.price is not None
        return float(rule.price)

    if rule.type == "at_fib":
        assert rule.level is not None
        w1s, w1t = _wave_1_anchors(ctx)
        level = float(rule.level)
        # Levels ≤ 1.0 are RETRACEMENTS of Wave 1 (from the top down).
        # Levels > 1.0 are EXTENSIONS anchored on the Wave 2 low (the
        # Wave 3 / Wave 5 target line). Matches fibonacci.wave_3_target
        # and the convention used by the agent-facing pattern docs.
        if level <= 1.0:
            levels = wave_1_retracement_levels(w1s, w1t)
            if level in levels:
                return float(levels[level])
            return w1t.price - level * (w1t.price - w1s.price)
        # Extension path — needs the Wave 2 low anchor too.
        from simualpha_quant.research.waves import find_developing_wave_2

        relevant = [p for p in ctx.pivots if p.index <= ctx.current_index]
        dev = find_developing_wave_2(relevant)
        if not dev:
            raise UnresolvablePriceRule("no developing Wave-2 anchors for extension")
        _, _, w2_low = dev[-1]
        height = w1t.price - w1s.price
        return w2_low.price + level * height

    if rule.type == "at_ma":
        assert rule.period is not None and rule.freq is not None
        close = ctx.prices["close"]
        if rule.freq == "daily":
            series = sma(close, rule.period)
        elif rule.freq == "weekly":
            series = weekly_sma_aligned(close, rule.period)
        elif rule.freq == "monthly":
            series = monthly_sma_aligned(close, rule.period)
        else:  # pragma: no cover — validated at schema level
            raise UnresolvablePriceRule(f"unknown freq {rule.freq!r}")
        v = series.iloc[ctx.current_index]
        if pd.isna(v):
            raise UnresolvablePriceRule(f"{rule.freq} SMA({rule.period}) warming up")
        return float(v)

    raise UnresolvablePriceRule(f"unknown price_rule type: {rule.type}")  # pragma: no cover
