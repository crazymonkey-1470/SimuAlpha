"""backtest_pattern tool — pure function tests (no HTTP / MCP)."""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest

from simualpha_quant.research import backtest as engine_mod
from simualpha_quant.research import universes
from simualpha_quant.schemas.backtest import BacktestPatternRequest
from simualpha_quant.schemas.charts import DateRange
from simualpha_quant.schemas.universe import UniverseSpec
import importlib

bp = importlib.import_module("simualpha_quant.tools.backtest_pattern")
from simualpha_quant.tools.backtest_pattern import backtest_pattern, spec_hash  # noqa: E402


def _impulse_frame() -> pd.DataFrame:
    prices = [100.0]
    def leg(a, b, n):
        return list(np.linspace(a, b, n))[1:]
    prices += leg(100, 130, 30)
    prices += leg(130, 115, 15)
    prices += leg(115, 165, 50)
    prices += leg(165, 145, 20)
    prices += leg(145, 195, 50)
    prices += list(np.linspace(195, 250, 250))
    idx = pd.date_range("2020-01-01", periods=len(prices), freq="B")
    return pd.DataFrame(
        {"open": prices, "high": prices, "low": prices, "close": prices, "volume": [1] * len(prices)},
        index=idx,
    )


@pytest.fixture(autouse=True)
def _stub_price_source(monkeypatch):
    """Replace run_backtest's price_loader with a synthetic series and
    stub out cache/audit writes."""
    # Stub cache read/write + signal audit to no-ops.
    monkeypatch.setattr(bp, "_cache_read", lambda h, ttl_days=30: None)
    monkeypatch.setattr(bp, "_cache_write", lambda *a, **kw: None)
    monkeypatch.setattr(bp, "_record_signals", lambda *a, **kw: None)

    # Wire run_backtest so qlib is never touched.
    original = engine_mod.run_backtest
    df = _impulse_frame()

    def patched(*args, **kwargs):
        kwargs["price_loader"] = lambda t, s, e: df
        return original(*args, **kwargs)

    monkeypatch.setattr(bp, "run_backtest", patched)


def test_tool_returns_response_shape():
    req = BacktestPatternRequest(
        pattern_name="wave_2_at_618",
        universe_spec=UniverseSpec(tickers=["HIMS", "NKE"]),
        date_range=DateRange(start=date(2020, 1, 1), end=date(2022, 1, 1)),
    )
    resp = backtest_pattern(req)
    assert resp.pattern_name == "wave_2_at_618"
    assert resp.universe_resolved == 2
    assert resp.signal_count >= 2
    assert len(resp.stats) == 4          # default horizons [3,6,12,24]
    assert resp.cached is False
    assert len(resp.hash) == 32


def test_unknown_pattern_raises():
    req = BacktestPatternRequest(
        pattern_name="not_a_real_pattern",
        universe_spec=UniverseSpec(tickers=["HIMS"]),
        date_range=DateRange(start=date(2020, 1, 1), end=date(2022, 1, 1)),
    )
    with pytest.raises(KeyError):
        backtest_pattern(req)


def test_custom_expression_path():
    req = BacktestPatternRequest(
        custom_expression={"gt": {"a": "$close", "b": 1.0}},
        universe_spec=UniverseSpec(tickers=["HIMS"]),
        date_range=DateRange(start=date(2020, 1, 1), end=date(2022, 1, 1)),
    )
    resp = backtest_pattern(req)
    # Constant "always true" expression → one signal per bar; many.
    assert resp.signal_count > 10
    assert resp.pattern_name is None  # not a named pattern


def test_spec_hash_deterministic():
    req1 = BacktestPatternRequest(
        pattern_name="wave_2_at_618",
        universe_spec=UniverseSpec(tickers=["HIMS"]),
        date_range=DateRange(start=date(2020, 1, 1), end=date(2022, 1, 1)),
    )
    req2 = BacktestPatternRequest(
        pattern_name="wave_2_at_618",
        universe_spec=UniverseSpec(tickers=["hims"]),  # case-normalized
        date_range=DateRange(start=date(2020, 1, 1), end=date(2022, 1, 1)),
    )
    assert spec_hash(req1) == spec_hash(req2)
