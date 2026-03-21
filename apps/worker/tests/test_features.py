"""Tests for feature engineering pipeline."""

from __future__ import annotations

import math
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from worker.engine.features import (
    build_snapshot_for_date,
    compute_features,
)


def _make_ohlcv(n_days: int = 100, base_price: float = 500.0) -> pd.DataFrame:
    """Create a synthetic OHLCV DataFrame for testing."""
    dates = pd.bdate_range(end="2024-06-28", periods=n_days)
    np.random.seed(42)
    returns = np.random.normal(0.0005, 0.01, n_days)
    prices = base_price * np.cumprod(1 + returns)
    volume = np.random.randint(50_000_000, 150_000_000, n_days).astype(float)

    return pd.DataFrame({
        "open": prices * (1 - np.abs(returns) / 2),
        "high": prices * (1 + np.abs(returns)),
        "low": prices * (1 - np.abs(returns)),
        "close": prices,
        "volume": volume,
    }, index=dates)


class TestComputeFeatures:
    def test_returns_dataframe_with_features(self):
        df = _make_ohlcv(100)
        features = compute_features(df, "SPY")
        assert len(features) == 100
        assert "return_1d" in features.columns
        assert "return_5d" in features.columns
        assert "return_20d" in features.columns
        assert "realized_vol" in features.columns
        assert "momentum_score" in features.columns
        assert "trend_strength" in features.columns
        assert "mean_reversion_score" in features.columns
        assert "volume_zscore" in features.columns

    def test_no_future_leakage_in_returns(self):
        df = _make_ohlcv(30)
        features = compute_features(df, "SPY")
        # return_1d at day i should only use close[i] and close[i-1]
        for i in range(1, len(features)):
            expected = (df["close"].iloc[i] - df["close"].iloc[i - 1]) / df["close"].iloc[i - 1]
            actual = features["return_1d"].iloc[i]
            assert abs(expected - actual) < 1e-10

    def test_realized_vol_reasonable(self):
        df = _make_ohlcv(100)
        features = compute_features(df, "SPY")
        vol = features["realized_vol"].dropna()
        # With 1% daily std, annualized should be ~15.9%
        assert vol.mean() > 0.05
        assert vol.mean() < 0.50

    def test_features_in_valid_ranges(self):
        df = _make_ohlcv(100)
        features = compute_features(df, "SPY")
        # Check bounded features are within bounds
        assert features["momentum_score"].dropna().between(-1, 1).all()
        assert features["mean_reversion_score"].dropna().between(-1, 1).all()
        assert features["trend_strength"].dropna().between(-1, 1).all()
        assert features["breadth_proxy"].dropna().between(-1, 1).all()
        assert features["sentiment_score"].dropna().between(-1, 1).all()
        assert features["gap_risk"].dropna().between(0, 1).all()
        assert features["macro_event_risk"].dropna().between(0, 1).all()
        assert features["dealer_support_proxy"].dropna().between(-1, 1).all()

    def test_tlt_yield_change_proxy(self):
        df = _make_ohlcv(50)
        features = compute_features(df, "TLT")
        # TLT should have non-zero yield change proxy
        ych = features["yield_change_proxy"].dropna()
        assert len(ych) > 0
        assert ych.abs().mean() > 0

    def test_empty_dataframe(self):
        df = pd.DataFrame()
        features = compute_features(df, "SPY")
        assert features.empty


class TestBuildSnapshot:
    def test_builds_snapshot_for_valid_date(self):
        spy_df = _make_ohlcv(100)
        tlt_df = _make_ohlcv(100, base_price=95.0)

        spy_features = compute_features(spy_df, "SPY")
        tlt_features = compute_features(tlt_df, "TLT")

        target_date = spy_features.index[-1].strftime("%Y-%m-%d")
        snapshot = build_snapshot_for_date(
            {"SPY": spy_features, "TLT": tlt_features},
            target_date,
        )
        assert snapshot is not None
        assert "SPY" in snapshot.states
        assert snapshot.primary.instrument == "SPY"
        assert snapshot.primary.price > 0
        assert -1 <= snapshot.primary.trend_strength <= 1

    def test_returns_none_for_missing_date(self):
        spy_df = _make_ohlcv(100)
        spy_features = compute_features(spy_df, "SPY")
        snapshot = build_snapshot_for_date({"SPY": spy_features}, "1999-01-01")
        assert snapshot is None

    def test_cross_fills_yield_change(self):
        spy_df = _make_ohlcv(100)
        tlt_df = _make_ohlcv(100, base_price=95.0)

        spy_features = compute_features(spy_df, "SPY")
        tlt_features = compute_features(tlt_df, "TLT")

        target_date = spy_features.index[-1].strftime("%Y-%m-%d")
        snapshot = build_snapshot_for_date(
            {"SPY": spy_features, "TLT": tlt_features},
            target_date,
        )
        assert snapshot is not None
        # SPY should have yield_change from TLT
        spy_yield = snapshot.states["SPY"].yield_change_proxy
        tlt_yield = snapshot.states["TLT"].yield_change_proxy
        assert spy_yield == tlt_yield
