"""Resampling correctness."""

from __future__ import annotations

import pandas as pd
import pytest

from simualpha_quant.charts.resample import resample_ohlcv


def _daily_frame(n_days: int = 28) -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=n_days, freq="D")
    df = pd.DataFrame(
        {
            "open":  [10.0 + i * 0.1 for i in range(n_days)],
            "high":  [10.5 + i * 0.1 for i in range(n_days)],
            "low":   [9.5 + i * 0.1 for i in range(n_days)],
            "close": [10.2 + i * 0.1 for i in range(n_days)],
            "volume": [1000 + i for i in range(n_days)],
        },
        index=idx,
    )
    return df


def test_daily_passthrough():
    df = _daily_frame(10)
    out = resample_ohlcv(df, "daily")
    pd.testing.assert_frame_equal(out, df)


def test_weekly_aggregates_correctly():
    df = _daily_frame(28)
    weekly = resample_ohlcv(df, "weekly")
    assert len(weekly) >= 4
    # Every weekly high must equal the max of the underlying daily highs
    # that fall in its (Sat..Fri) window. Verify overall: weekly max == daily max.
    assert weekly["high"].max() == pytest.approx(df["high"].max())
    assert weekly["low"].min() == pytest.approx(df["low"].min())


def test_monthly_aggregates_correctly():
    df = _daily_frame(120)
    monthly = resample_ohlcv(df, "monthly")
    assert len(monthly) >= 3
    # Volume sums up.
    assert monthly["volume"].sum() == df["volume"].sum()


def test_requires_datetime_index():
    df = _daily_frame(5).reset_index(drop=True)
    with pytest.raises(TypeError):
        resample_ohlcv(df, "weekly")
