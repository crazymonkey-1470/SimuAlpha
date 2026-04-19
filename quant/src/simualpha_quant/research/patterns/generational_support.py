"""generational_support — 0.786 Fib + Wave 1 origin + 200MMA within 15%."""

from __future__ import annotations

from datetime import date

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
    # Generational setups are identified on the primary (monthly) degree.
    "pivot_sensitivity": PIVOT_SENSITIVITY_PRIMARY,
    "tolerance": GENERATIONAL_TOLERANCE,
    "mma_period": MA_SLOW_PERIOD,
}


def detect(prices: pd.DataFrame, params: dict | None = None) -> list[date]:
    p = merge_with_default_params(DEFAULT_PARAMS, params)
    if "close" not in prices.columns:
        raise ValueError("prices must include a 'close' column")

    sensitivity = float(p["pivot_sensitivity"])
    tolerance = float(p["tolerance"])
    mma_period = int(p["mma_period"])

    close = prices["close"].astype(float)
    mma = monthly_sma_aligned(close, mma_period)

    pivots = detect_pivots(close, sensitivity=sensitivity)
    setups = find_developing_wave_2(pivots)
    if not setups:
        return []

    fired: list[date] = []
    for w1_start, w1_top, _w2_low in setups:
        fib786 = wave_1_retracement_levels(w1_start, w1_top)[FIB_786]
        wave1_origin = w1_start.price
        start_idx = w1_top.index
        for j in range(start_idx, len(close)):
            mj = float(mma.iloc[j]) if pd.notna(mma.iloc[j]) else None
            if mj is None:
                continue
            cj = float(close.iloc[j])
            values = [fib786, wave1_origin, mj]
            avg = sum(values) / 3.0
            spread = max(values) - min(values)
            if avg <= 0:
                continue
            if spread / avg < tolerance and within(cj, avg, tolerance):
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
    name="generational_support",
    description=(
        "0.786 Fibonacci retracement of Wave 1 + the Wave 1 origin "
        "price + the 200-month SMA all converge within ±15% of each "
        "other, with the current price within the same envelope. Per "
        "TLI Sec 5.2 this is GENERATIONAL_BUY — the rarest, highest-"
        "conviction setup."
    ),
    default_params=dict(DEFAULT_PARAMS),
    detect=detect,
)
