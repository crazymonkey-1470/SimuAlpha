"""confluence_zone — 200WMA + 0.618 Fib within 3% of each other,
price within 3% of either. Highest-conviction TLI confluence (Sec 5.2).
"""

from __future__ import annotations

from datetime import date

import pandas as pd

from simualpha_quant.research.fibonacci import wave_1_retracement_levels
from simualpha_quant.research.patterns._base import (
    PatternDef,
    merge_with_default_params,
    weekly_sma_aligned,
    within,
)
from simualpha_quant.research.waves import (
    detect_pivots,
    find_developing_wave_2,
)
from simualpha_quant.tli_constants import (
    CONFLUENCE_ZONE_TOLERANCE,
    FIB_618,
    MA_SLOW_PERIOD,
    PIVOT_SENSITIVITY_INTERMEDIATE,
)

DEFAULT_PARAMS = {
    "pivot_sensitivity": PIVOT_SENSITIVITY_INTERMEDIATE,
    # Tolerance between 200WMA and 0.618 fib (and between price and either).
    "tolerance": CONFLUENCE_ZONE_TOLERANCE,
    "wma_period": MA_SLOW_PERIOD,
    # Max # trading days a confluence setup remains "fireable" after
    # all three conditions first align.
    "min_consecutive_days": 1,
}


def detect(prices: pd.DataFrame, params: dict | None = None) -> list[date]:
    p = merge_with_default_params(DEFAULT_PARAMS, params)
    if "close" not in prices.columns:
        raise ValueError("prices must include a 'close' column")

    sensitivity = float(p["pivot_sensitivity"])
    tolerance = float(p["tolerance"])
    wma_period = int(p["wma_period"])
    min_days = int(p["min_consecutive_days"])

    close = prices["close"].astype(float)
    wma = weekly_sma_aligned(close, wma_period)

    pivots = detect_pivots(close, sensitivity=sensitivity)
    setups = find_developing_wave_2(pivots)
    if not setups:
        return []

    fired: list[date] = []
    for w1_start, w1_top, _w2_low in setups:
        fib618 = wave_1_retracement_levels(w1_start, w1_top)[FIB_618]
        # The 200WMA value is updated bar-by-bar; we scan from W1_top
        # forward for the first day the three-way alignment holds.
        # This biases toward the *earliest* signal post-Wave-1.
        start_idx = w1_top.index
        run = 0
        for j in range(start_idx, len(close)):
            wj = float(wma.iloc[j]) if pd.notna(wma.iloc[j]) else None
            if wj is None:
                run = 0
                continue
            if (
                within(wj, fib618, tolerance)
                and within(float(close.iloc[j]), fib618, tolerance)
                and within(float(close.iloc[j]), wj, tolerance)
            ):
                run += 1
                if run >= min_days:
                    fired.append(close.index[j].date())
                    break
            else:
                run = 0

    seen: set[date] = set()
    out: list[date] = []
    for d in fired:
        if d not in seen:
            seen.add(d)
            out.append(d)
    return out


PATTERN = PatternDef(
    name="confluence_zone",
    description=(
        "Price sits within ±3% of BOTH the 0.618 Fibonacci retracement "
        "of an active Wave 1 AND the 200-week SMA, with the 200WMA "
        "and 0.618 fib themselves within ±3% of each other. Per TLI "
        "Sec 5.2 this is the highest-conviction confluence."
    ),
    default_params=dict(DEFAULT_PARAMS),
    detect=detect,
)
