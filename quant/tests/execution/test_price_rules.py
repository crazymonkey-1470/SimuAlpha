"""Price-rule resolver."""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest

from simualpha_quant.execution.price_rules import (
    ResolveContext,
    UnresolvablePriceRule,
    resolve,
)
from simualpha_quant.research.waves import detect_pivots
from simualpha_quant.schemas import PriceRule


def _impulse_frame() -> pd.DataFrame:
    prices = [100.0]

    def leg(a, b, n):
        return list(np.linspace(a, b, n))[1:]

    prices += leg(100, 130, 30)
    prices += leg(130, 115, 15)
    prices += leg(115, 165, 50)
    idx = pd.date_range("2020-01-01", periods=len(prices), freq="B")
    return pd.DataFrame(
        {"open": prices, "high": prices, "low": prices, "close": prices, "volume": [1] * len(prices)},
        index=idx,
    )


def _ctx(at: int, signal_at: int | None = None) -> ResolveContext:
    df = _impulse_frame()
    pivots = detect_pivots(df["close"], sensitivity=0.05)
    return ResolveContext(prices=df, current_index=at, signal_index=signal_at if signal_at is not None else at, pivots=pivots)


def test_at_signal_returns_signal_bar_close():
    ctx = _ctx(at=50, signal_at=30)
    price = resolve(PriceRule(type="at_signal"), ctx)
    assert price == pytest.approx(ctx.prices["close"].iloc[30])


def test_at_price_returns_literal():
    ctx = _ctx(at=50)
    price = resolve(PriceRule(type="at_price", price=123.45), ctx)
    assert price == 123.45


def test_at_fib_618_resolves_to_wave_1_retracement():
    # Wave 1 is 100 → 130. 0.618 retracement = 130 - 0.618*30 = 111.46.
    # Context must be after W2 completes so the developing-W2 finder fires.
    ctx = _ctx(at=60)
    price = resolve(PriceRule(type="at_fib", level=0.618), ctx)
    assert price == pytest.approx(111.46, abs=0.01)


def test_at_fib_unresolvable_before_wave_1():
    ctx = _ctx(at=5)
    with pytest.raises(UnresolvablePriceRule):
        resolve(PriceRule(type="at_fib", level=0.618), ctx)


def test_at_ma_daily_resolves_to_rolling_mean():
    ctx = _ctx(at=60)
    price = resolve(PriceRule(type="at_ma", period=5, freq="daily"), ctx)
    # 5-bar SMA at that index should be ~close[56..60] mean.
    expected = float(ctx.prices["close"].iloc[56:61].mean())
    assert price == pytest.approx(expected, abs=1e-6)


def test_at_ma_unresolvable_before_warmup():
    ctx = _ctx(at=3)
    with pytest.raises(UnresolvablePriceRule):
        resolve(PriceRule(type="at_ma", period=200, freq="daily"), ctx)
