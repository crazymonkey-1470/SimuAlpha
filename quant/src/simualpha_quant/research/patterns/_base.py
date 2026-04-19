"""Pattern detector protocol + shared utilities.

A pattern detector is a pure function:

    def detect(prices: pd.DataFrame, params: dict | None) -> list[date]

It receives a single ticker's daily OHLCV (DatetimeIndex, columns
``open``, ``high``, ``low``, ``close``, ``volume``) and returns the
chronological list of dates on which the pattern fired.

Detectors must be deterministic and side-effect-free. Any TLI-derived
constant must come from ``simualpha_quant.tli_constants`` —
hard-coding a threshold is a code-review block.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Callable, Protocol

import pandas as pd


class PatternFn(Protocol):
    def __call__(
        self, prices: pd.DataFrame, params: dict | None = None
    ) -> list[date]: ...


@dataclass(frozen=True)
class PatternDef:
    """Metadata for one named pattern in the library."""
    name: str
    description: str
    default_params: dict
    detect: PatternFn


# ───────────────────── shared helpers used by detectors ──────────────────


def sma(series: pd.Series, period: int) -> pd.Series:
    """Simple moving average. min_periods=period for strict alignment."""
    return series.rolling(window=period, min_periods=period).mean()


def weekly_sma_aligned(close: pd.Series, period: int) -> pd.Series:
    """200-period MA on weekly closes, forward-filled to the daily index.

    Used for "200WMA" computations against a daily series. The result
    is undefined (NaN) for any daily timestamp before the 200th
    completed week.
    """
    weekly = close.resample("W-FRI").last()
    wma = weekly.rolling(window=period, min_periods=period).mean()
    return wma.reindex(close.index, method="ffill")


def monthly_sma_aligned(close: pd.Series, period: int) -> pd.Series:
    """200-period MA on monthly closes, forward-filled to the daily index."""
    monthly = close.resample("ME").last()
    mma = monthly.rolling(window=period, min_periods=period).mean()
    return mma.reindex(close.index, method="ffill")


def within(value: float, target: float, tolerance: float) -> bool:
    """abs(value - target) / target <= tolerance, NaN-safe."""
    if target == 0 or value != value or target != target:  # NaN-safe
        return False
    return abs(value - target) / abs(target) <= tolerance


def merge_with_default_params(default: dict, override: dict | None) -> dict:
    if override is None:
        return dict(default)
    out = dict(default)
    out.update(override)
    return out
