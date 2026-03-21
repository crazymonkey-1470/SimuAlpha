"""Market state input model for the SimuAlpha simulation engine.

MarketState is the structured input that all engine components consume.
It represents the observable state of a single instrument at a point in time.
MarketSnapshot aggregates multiple instruments into a single cross-asset view.

For the MVP, synthetic data is generated deterministically from seeded math.
When real market data is available, replace generate_synthetic_snapshot()
with a loader that populates the same MarketState schema from live feeds.
"""

from __future__ import annotations

import math
import random
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


class VolatilityRegime(str, Enum):
    COMPRESSED = "compressed"
    NORMAL = "normal"
    ELEVATED = "elevated"
    EXTREME = "extreme"


class MarketState(BaseModel):
    """Observable state for a single instrument at a point in time."""

    timestamp: datetime
    instrument: str
    price: float
    return_1d: float = Field(description="1-day return as decimal, e.g. 0.01 = +1%")
    return_5d: float = Field(description="5-day cumulative return")
    return_20d: float = Field(description="20-day cumulative return")
    realized_vol: float = Field(ge=0, description="Annualized realized vol, e.g. 0.15 = 15%")
    volume_zscore: float = Field(description="Volume relative to 20-day average, z-scored")
    breadth_proxy: float = Field(ge=-1, le=1, description="Breadth measure: +1 broad advance, -1 broad decline")
    momentum_score: float = Field(ge=-1, le=1, description="Composite momentum signal")
    mean_reversion_score: float = Field(ge=-1, le=1, description="+1 = deeply oversold (buy signal), -1 = deeply overbought (sell signal)")
    yield_change_proxy: float = Field(description="Change in 10Y proxy, in bps (e.g. +5 = rates rising)")
    volatility_regime: VolatilityRegime
    macro_event_risk: float = Field(ge=0, le=1, description="0 = no event risk, 1 = maximum event risk")
    sentiment_score: float = Field(ge=-1, le=1, description="-1 extreme fear, +1 extreme greed")
    trend_strength: float = Field(ge=-1, le=1, description="+1 strong uptrend, -1 strong downtrend")
    gap_risk: float = Field(ge=0, le=1, description="Probability-weighted gap risk")
    dealer_support_proxy: float = Field(ge=-1, le=1, description="+1 dealer stabilizing, -1 dealer destabilizing")


class MarketSnapshot(BaseModel):
    """Cross-asset market state at a single point in time."""

    timestamp: datetime
    states: dict[str, MarketState] = Field(description="Keyed by instrument ticker")

    @property
    def primary(self) -> MarketState:
        """Return SPY state as the primary equity reference."""
        return self.states["SPY"]


# ── Instrument definitions for synthetic generation ──────────────────────────

_INSTRUMENTS = {
    "SPY": {"base_price": 567.50, "base_vol": 0.14, "beta": 1.0},
    "QQQ": {"base_price": 485.20, "base_vol": 0.18, "beta": 1.25},
    "TLT": {"base_price": 92.30, "base_vol": 0.12, "beta": -0.30},
    "VIX": {"base_price": 16.50, "base_vol": 0.80, "beta": -3.0},
    "NVDA": {"base_price": 875.00, "base_vol": 0.42, "beta": 1.60},
}


def generate_synthetic_snapshot(
    rng: random.Random,
    ts: datetime | None = None,
    day_offset: int = 0,
) -> MarketSnapshot:
    """Generate a complete synthetic MarketSnapshot.

    Uses day_offset to create a coherent time series — the same offset
    with the same rng state always produces the same snapshot.
    """
    ts = ts or datetime.now(timezone.utc)

    # Generate a market-wide "impulse" that correlates instruments
    market_impulse = rng.gauss(0.0, 0.008)  # ~0.8% daily sigma for market
    macro_shift = rng.gauss(0, 0.3)  # macro sentiment drift
    vol_shock = max(0, rng.gauss(0, 0.03))  # vol only shocks upward

    # Slow-moving state (evolves with day_offset for time series)
    trend_base = 0.15 * math.sin(day_offset * 0.12) + rng.gauss(0, 0.08)
    macro_risk_base = max(0, min(1, 0.25 + 0.2 * math.sin(day_offset * 0.08) + rng.gauss(0, 0.1)))
    breadth_base = max(-1, min(1, 0.2 + 0.3 * math.sin(day_offset * 0.15) + rng.gauss(0, 0.15)))
    dealer_base = max(-1, min(1, 0.3 - 0.4 * math.sin(day_offset * 0.1) + rng.gauss(0, 0.12)))
    sentiment_base = max(-1, min(1, 0.1 + 0.3 * math.sin(day_offset * 0.09) + rng.gauss(0, 0.15)))

    states: dict[str, MarketState] = {}
    for ticker, spec in _INSTRUMENTS.items():
        states[ticker] = _generate_instrument_state(
            rng=rng,
            ts=ts,
            ticker=ticker,
            spec=spec,
            market_impulse=market_impulse,
            vol_shock=vol_shock,
            trend_base=trend_base,
            macro_risk_base=macro_risk_base,
            breadth_base=breadth_base,
            dealer_base=dealer_base,
            sentiment_base=sentiment_base,
            macro_shift=macro_shift,
        )

    return MarketSnapshot(timestamp=ts, states=states)


def _generate_instrument_state(
    rng: random.Random,
    ts: datetime,
    ticker: str,
    spec: dict,
    market_impulse: float,
    vol_shock: float,
    trend_base: float,
    macro_risk_base: float,
    breadth_base: float,
    dealer_base: float,
    sentiment_base: float,
    macro_shift: float,
) -> MarketState:
    beta = spec["beta"]
    base_vol = spec["base_vol"]

    # Returns are correlated through beta to market impulse
    idio_return = rng.gauss(0, base_vol / math.sqrt(252))
    return_1d = market_impulse * beta + idio_return

    # Multi-day returns accumulate with mean-reversion dampening
    return_5d = return_1d * 3.5 + rng.gauss(0, 0.005)  # not exactly 5x (dampened)
    return_20d = return_1d * 10 + rng.gauss(0, 0.015)

    # Realized vol responds to shocks
    realized_vol = max(0.04, base_vol + vol_shock * abs(beta) + rng.gauss(0, 0.01))

    # Volume z-score: higher on big moves
    volume_zscore = abs(return_1d) / (base_vol / math.sqrt(252)) + rng.gauss(0, 0.3)

    # Momentum: trend_base adjusted by instrument beta
    momentum_score = _clamp(trend_base * (1 if beta > 0 else -1) + rng.gauss(0, 0.08), -1, 1)

    # Mean reversion: opposite of recent stretch
    stretch = return_5d / max(0.001, realized_vol * math.sqrt(5 / 252))
    mean_reversion_score = _clamp(-stretch * 0.3, -1, 1)

    # Trend strength
    trend_strength = _clamp(
        (0.5 * _sign(return_20d) * min(1, abs(return_20d) / 0.05)
         + 0.3 * momentum_score
         + 0.2 * _sign(return_5d) * min(1, abs(return_5d) / 0.03)),
        -1, 1,
    )

    # Volatility regime classification
    if realized_vol < base_vol * 0.7:
        vol_regime = VolatilityRegime.COMPRESSED
    elif realized_vol < base_vol * 1.2:
        vol_regime = VolatilityRegime.NORMAL
    elif realized_vol < base_vol * 1.8:
        vol_regime = VolatilityRegime.ELEVATED
    else:
        vol_regime = VolatilityRegime.EXTREME

    # VIX-specific: invert certain signals
    if ticker == "VIX":
        # VIX mean reversion is special — high VIX is oversold for equities
        mean_reversion_score = _clamp(stretch * 0.2, -1, 1)
        trend_strength = -trend_strength  # VIX trends inversely

    # Yield change: correlated with macro shift
    yield_change = macro_shift * 3 + rng.gauss(0, 2)

    # Gap risk: higher when vol elevated and event risk present
    gap_risk = _clamp(
        0.1 + 0.3 * max(0, (realized_vol - base_vol) / base_vol)
        + 0.3 * macro_risk_base
        + rng.gauss(0, 0.05),
        0, 1,
    )

    price = spec["base_price"] * (1 + return_1d)

    return MarketState(
        timestamp=ts,
        instrument=ticker,
        price=round(price, 2),
        return_1d=round(return_1d, 5),
        return_5d=round(return_5d, 5),
        return_20d=round(return_20d, 5),
        realized_vol=round(realized_vol, 4),
        volume_zscore=round(volume_zscore, 2),
        breadth_proxy=round(_clamp(breadth_base + rng.gauss(0, 0.05), -1, 1), 2),
        momentum_score=round(momentum_score, 3),
        mean_reversion_score=round(mean_reversion_score, 3),
        yield_change_proxy=round(yield_change, 1),
        volatility_regime=vol_regime,
        macro_event_risk=round(macro_risk_base, 2),
        sentiment_score=round(_clamp(sentiment_base + rng.gauss(0, 0.05), -1, 1), 2),
        trend_strength=round(trend_strength, 3),
        gap_risk=round(gap_risk, 2),
        dealer_support_proxy=round(_clamp(dealer_base + rng.gauss(0, 0.05), -1, 1), 2),
    )


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _sign(v: float) -> float:
    if v > 0:
        return 1.0
    elif v < 0:
        return -1.0
    return 0.0
