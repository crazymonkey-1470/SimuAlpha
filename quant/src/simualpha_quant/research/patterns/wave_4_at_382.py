"""wave_4_at_382 — Wave 4 ADD zone at 0.382 Fib of Wave 3.

Hard rule enforced: ``wave4_low > wave1_top`` (no overlap; standard
impulse / extended only — diagonal patterns are out of scope for
Stage 3).
"""

from __future__ import annotations

from datetime import date

import pandas as pd

from simualpha_quant.research.fibonacci import wave_4_retracement_price
from simualpha_quant.research.patterns._base import (
    PatternDef,
    merge_with_default_params,
)
from simualpha_quant.research.waves import (
    detect_pivots,
    find_developing_wave_4,
)
from simualpha_quant.tli_constants import (
    PIVOT_SENSITIVITY_INTERMEDIATE,
    WAVE4_FIB_VALIDATION_TOLERANCE,
)

DEFAULT_PARAMS = {
    "pivot_sensitivity": PIVOT_SENSITIVITY_INTERMEDIATE,
    # Tolerance around the 0.382 retracement target — backed by the
    # tighter Wave-4 tolerance noted in tli_constants.md (10%).
    "fib_tolerance": WAVE4_FIB_VALIDATION_TOLERANCE,
    # Confirmation window after W4 low pivot.
    "max_confirmation_days": 30,
}


def detect(prices: pd.DataFrame, params: dict | None = None) -> list[date]:
    p = merge_with_default_params(DEFAULT_PARAMS, params)
    if "close" not in prices.columns:
        raise ValueError("prices must include a 'close' column")

    sensitivity = float(p["pivot_sensitivity"])
    tol = float(p["fib_tolerance"])
    max_days = int(p["max_confirmation_days"])

    close = prices["close"].astype(float)
    pivots = detect_pivots(close, sensitivity=sensitivity)
    setups = find_developing_wave_4(pivots)
    if not setups:
        return []

    fired: list[date] = []
    for w1_start, w1_top, w2_low, w3_top, w4_low in setups:
        target = wave_4_retracement_price(w3_top, w2_low)
        deviation = abs(w4_low.price - target) / max(abs(target), 1e-9)
        if deviation > tol:
            continue
        # Confirmation: close back above the W4 low after touching the
        # target zone.
        start_idx = w4_low.index
        end_idx = min(start_idx + max_days, len(close) - 1)
        for j in range(start_idx + 1, end_idx + 1):
            cj = float(close.iloc[j])
            if cj > w4_low.price:
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
    name="wave_4_at_382",
    description=(
        "Wave 4 of an Elliott impulse retraces near the 0.382 Fib of "
        "Wave 3, with `wave4_low > wave1_top` (no W4/W1 overlap). "
        "Confirmed when price closes back above the Wave 4 low. "
        "Implements TLI spec 3.1 (impulse hard rule 3) + 4.2 (Wave 4 "
        "ADD zone). Diagonal-pattern variants are out of scope for "
        "Stage 3."
    ),
    default_params=dict(DEFAULT_PARAMS),
    detect=detect,
)
