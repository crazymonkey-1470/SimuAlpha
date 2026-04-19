"""impossible_level — horizontal S/R + 0.786 Fib + 200MMA convergence within 15%.

The "impossible level" pattern is the NKE-style setup: a recurring
horizontal support/resistance level (a price the market has revisited
multiple times) coincides with the 0.786 Fib retracement of an active
Wave 1 AND the 200-month SMA, all within 15% of each other.

A horizontal S/R is detected as a price level the close touched at
least N times within a tolerance band over the trailing window.
"""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd

from simualpha_quant.research.fibonacci import wave_1_retracement_levels
from simualpha_quant.research.patterns._base import (
    PatternDef,
    merge_with_default_params,
    monthly_sma_aligned,
    within,
)
from simualpha_quant.research.waves import (
    detect_pivots,
    find_developing_wave_2,
)
from simualpha_quant.tli_constants import (
    FIB_786,
    GENERATIONAL_TOLERANCE,
    MA_SLOW_PERIOD,
    PIVOT_SENSITIVITY_PRIMARY,
)

DEFAULT_PARAMS = {
    "pivot_sensitivity": PIVOT_SENSITIVITY_PRIMARY,
    "tolerance": GENERATIONAL_TOLERANCE,
    "mma_period": MA_SLOW_PERIOD,
    # A horizontal S/R requires this many distinct touches in the
    # trailing lookback. "Touch" = close within `touch_tolerance` of the
    # candidate level.
    "horizontal_min_touches": 3,
    "horizontal_lookback_days": 504,    # ~2 trading years
    "horizontal_touch_tolerance": 0.02,
}


def _horizontal_level_near(
    close: pd.Series,
    j: int,
    *,
    lookback: int,
    min_touches: int,
    touch_tolerance: float,
) -> float | None:
    """Return the most-touched horizontal level near close[j], or None."""
    lo = max(0, j - lookback)
    window = close.iloc[lo : j + 1].astype(float).to_numpy()
    if window.size < min_touches:
        return None

    candidate = float(close.iloc[j])
    band_lo = candidate * (1.0 - touch_tolerance)
    band_hi = candidate * (1.0 + touch_tolerance)
    touches = int(np.sum((window >= band_lo) & (window <= band_hi)))
    if touches >= min_touches:
        return candidate
    return None


def detect(prices: pd.DataFrame, params: dict | None = None) -> list[date]:
    p = merge_with_default_params(DEFAULT_PARAMS, params)
    if "close" not in prices.columns:
        raise ValueError("prices must include a 'close' column")

    sensitivity = float(p["pivot_sensitivity"])
    tolerance = float(p["tolerance"])
    mma_period = int(p["mma_period"])
    min_touches = int(p["horizontal_min_touches"])
    lookback = int(p["horizontal_lookback_days"])
    touch_tol = float(p["horizontal_touch_tolerance"])

    close = prices["close"].astype(float)
    mma = monthly_sma_aligned(close, mma_period)

    pivots = detect_pivots(close, sensitivity=sensitivity)
    setups = find_developing_wave_2(pivots)
    if not setups:
        return []

    fired: list[date] = []
    for w1_start, w1_top, _w2_low in setups:
        fib786 = wave_1_retracement_levels(w1_start, w1_top)[FIB_786]
        for j in range(w1_top.index, len(close)):
            mj = float(mma.iloc[j]) if pd.notna(mma.iloc[j]) else None
            if mj is None:
                continue
            horizontal = _horizontal_level_near(
                close,
                j,
                lookback=lookback,
                min_touches=min_touches,
                touch_tolerance=touch_tol,
            )
            if horizontal is None:
                continue
            values = [fib786, mj, horizontal]
            avg = sum(values) / 3.0
            spread = max(values) - min(values)
            if avg <= 0:
                continue
            if spread / avg < tolerance and within(float(close.iloc[j]), avg, tolerance):
                fired.append(close.index[j].date())
                break

    seen: set[date] = set()
    out: list[date] = []
    for d in fired:
        if d not in seen:
            seen.add(d)
            out.append(d)
    return out


PATTERN = PatternDef(
    name="impossible_level",
    description=(
        "A recurring horizontal support level (≥3 touches within a "
        "trailing 2-year lookback) coincides with the 0.786 Fib of "
        "Wave 1 AND the 200-month SMA, all converging within ±15%. "
        "The NKE-style setup."
    ),
    default_params=dict(DEFAULT_PARAMS),
    detect=detect,
)
