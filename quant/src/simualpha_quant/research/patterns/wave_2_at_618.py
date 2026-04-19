"""wave_2_at_618 — Wave 2 retracement to 0.5-0.618 Fib of Wave 1.

Confirmation requires close above the 50-day SMA (per TLI Sec 4.3).
All thresholds come from ``simualpha_quant.tli_constants``.
"""

from __future__ import annotations

from datetime import date

import pandas as pd

from simualpha_quant.research.fibonacci import wave_2_entry_band
from simualpha_quant.research.patterns._base import (
    PatternDef,
    merge_with_default_params,
    sma,
)
from simualpha_quant.research.waves import (
    detect_pivots,
    find_developing_wave_2,
    sensitivity_for_timeframe,
)
from simualpha_quant.tli_constants import (
    MA_FAST_PERIOD,
    PIVOT_SENSITIVITY_INTERMEDIATE,
)

DEFAULT_PARAMS = {
    # Pivot sensitivity for swing detection. 0.08 = weekly/intermediate,
    # 0.15 = monthly/primary. See tli_constants.
    "pivot_sensitivity": PIVOT_SENSITIVITY_INTERMEDIATE,
    # 50-day SMA must hold above the close to confirm Wave 2 (Sec 4.3).
    "ma_fast_period": MA_FAST_PERIOD,
    # Allowed slack around the 0.5-0.618 entry band (fraction of band height).
    "band_tolerance": 0.05,
    # How many trading days a confirmed Wave 2 setup remains "fireable"
    # after the W2 low pivot. 30 trading days ≈ six weeks.
    "max_confirmation_days": 30,
}


def detect(prices: pd.DataFrame, params: dict | None = None) -> list[date]:
    p = merge_with_default_params(DEFAULT_PARAMS, params)
    if "close" not in prices.columns:
        raise ValueError("prices must include a 'close' column")

    sensitivity = float(p["pivot_sensitivity"])
    ma_period = int(p["ma_fast_period"])
    band_tol = float(p["band_tolerance"])
    max_days = int(p["max_confirmation_days"])

    close = prices["close"].astype(float)
    ma_fast = sma(close, ma_period)

    pivots = detect_pivots(close, sensitivity=sensitivity)
    setups = find_developing_wave_2(pivots)
    if not setups:
        return []

    fired: list[date] = []
    for w1_start, w1_top, w2_low in setups:
        deeper, shallower = wave_2_entry_band(w1_start, w1_top)
        # Allow a bit of slack on either side of the 0.5-0.618 band.
        band_height = max(shallower - deeper, 1e-9)
        lo = deeper - band_tol * band_height
        hi = shallower + band_tol * band_height

        # Sanity: the W2 low itself must land in the (slack-extended) band.
        if not (lo <= w2_low.price <= hi):
            continue

        # Look forward from W2 low for the first day where:
        #   close >= deeper (still at/above the deepest entry level)
        #   close > 50d MA (the TLI confirmation rule)
        start_idx = w2_low.index
        end_idx = min(start_idx + max_days, len(close) - 1)
        for j in range(start_idx, end_idx + 1):
            cj = float(close.iloc[j])
            mj = float(ma_fast.iloc[j]) if pd.notna(ma_fast.iloc[j]) else None
            if mj is None:
                continue
            if cj >= deeper and cj > mj:
                fired.append(close.index[j].date())
                break  # one signal per W2 setup

    # Deduplicate while preserving chronological order.
    seen: set[date] = set()
    out: list[date] = []
    for d in fired:
        if d not in seen:
            seen.add(d)
            out.append(d)
    return out


PATTERN = PatternDef(
    name="wave_2_at_618",
    description=(
        "Wave 2 of an Elliott impulse retraces into the 0.5-0.618 Fib "
        "band of Wave 1, then closes back above its 50-day SMA. "
        "Implements TLI spec 3.1 (impulse hard rule 1) + 4.3 "
        "(50-day MA confirmation). Primary TLI buy zone."
    ),
    default_params=dict(DEFAULT_PARAMS),
    detect=detect,
)
