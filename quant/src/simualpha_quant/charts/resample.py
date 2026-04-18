"""Daily → weekly / monthly OHLCV resampling."""

from __future__ import annotations

from typing import Literal

import pandas as pd

Timeframe = Literal["daily", "weekly", "monthly"]

_RULE: dict[str, str] = {
    "daily": "D",
    "weekly": "W-FRI",  # week ending Friday (standard equity convention)
    "monthly": "ME",    # month-end
}


def resample_ohlcv(df: pd.DataFrame, timeframe: Timeframe) -> pd.DataFrame:
    """Resample a daily OHLCV frame. Index must be DatetimeIndex (ascending)."""
    if timeframe == "daily":
        return df

    if not isinstance(df.index, pd.DatetimeIndex):
        raise TypeError("resample_ohlcv requires a DatetimeIndex")

    rule = _RULE[timeframe]
    agg = {
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
    }
    if "adj_close" in df.columns:
        agg["adj_close"] = "last"
    if "volume" in df.columns:
        agg["volume"] = "sum"

    out = df.resample(rule).agg(agg).dropna(subset=["open", "high", "low", "close"])
    return out
