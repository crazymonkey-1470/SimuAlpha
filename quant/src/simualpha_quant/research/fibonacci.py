"""Fibonacci level math for Elliott Wave structures.

All formulas reference ``docs/tli-constants.md`` and use the canonical
values in ``simualpha_quant.tli_constants``. No magic numbers here.
"""

from __future__ import annotations

from simualpha_quant.research.waves import ImpulseStructure, Pivot
from simualpha_quant.tli_constants import (
    FIB_236,
    FIB_382,
    FIB_500,
    FIB_618,
    FIB_786,
    FIB_1618,
    FIB_2618,
    WAVE_2_RETRACE_HIGH,
    WAVE_2_RETRACE_LOW,
    WAVE_4_RETRACE,
)


# ─────────────────────────── retracement helpers ────────────────────────────


def retracement_level(start: float, end: float, fib: float) -> float:
    """Price level for a Fibonacci retracement.

    For an impulse leg from ``start`` (low) to ``end`` (high), the
    ``fib`` retracement is ``end - fib * (end - start)``. Works for
    both up legs (start<end) and down legs (start>end).
    """
    return end - fib * (end - start)


def extension_level(start: float, anchor: float, height: float, mult: float) -> float:
    """Generic Fib extension: anchor + mult * height."""
    return anchor + mult * height


# ─────────────────────────── Wave 1 retracements ────────────────────────────


def wave_1_retracement_levels(wave1_start: Pivot, wave1_top: Pivot) -> dict[float, float]:
    """All standard Fib retracement prices of Wave 1.

    Used by detectors that need Wave 2 entry math.
    """
    s, e = wave1_start.price, wave1_top.price
    return {
        FIB_236: retracement_level(s, e, FIB_236),
        FIB_382: retracement_level(s, e, FIB_382),
        FIB_500: retracement_level(s, e, FIB_500),
        FIB_618: retracement_level(s, e, FIB_618),
        FIB_786: retracement_level(s, e, FIB_786),
    }


def wave_2_entry_band(wave1_start: Pivot, wave1_top: Pivot) -> tuple[float, float]:
    """Inclusive ``(low, high)`` price band where a valid Wave 2 ends.

    ``WAVE_2_RETRACE_LOW (=0.5)`` to ``WAVE_2_RETRACE_HIGH (=0.618)``
    of Wave 1 — the TLI primary entry zone.
    """
    s, e = wave1_start.price, wave1_top.price
    deeper = retracement_level(s, e, WAVE_2_RETRACE_HIGH)   # 0.618 → lower price
    shallower = retracement_level(s, e, WAVE_2_RETRACE_LOW)  # 0.5 → higher price
    return (deeper, shallower)


# ─────────────────────────── Wave 3 / Wave 4 / Wave 5 ───────────────────────


def wave_3_target(wave1_start: Pivot, wave1_top: Pivot, wave2_low: Pivot) -> float:
    """Wave 3 target = wave2_low + 1.618 * (wave1_top - wave1_start)."""
    height = wave1_top.price - wave1_start.price
    return wave2_low.price + FIB_1618 * height


def wave_4_retracement_price(wave3_top: Pivot, wave2_low: Pivot) -> float:
    """Wave 4 ADD-zone price = wave3_top - 0.382 * (wave3_top - wave2_low)."""
    return wave3_top.price - WAVE_4_RETRACE * (wave3_top.price - wave2_low.price)


def wave_5_target(
    wave1_start: Pivot, wave1_top: Pivot, wave4_low: Pivot, *, extended: bool = False
) -> float:
    """Wave 5 target = wave4_low + (1.0 or 2.618) * Wave 1 height."""
    height = wave1_top.price - wave1_start.price
    mult = FIB_2618 if extended else 1.0
    return wave4_low.price + mult * height


# ─────────────────────────── full impulse helpers ───────────────────────────


def impulse_fib_levels(impulse: ImpulseStructure) -> dict[str, float]:
    """All TLI-relevant Fib levels for a completed impulse, keyed by name."""
    w1s, w1t = impulse.pivots[0], impulse.pivots[1]
    w2l = impulse.pivots[2]
    w3t = impulse.pivots[3]
    w4l = impulse.pivots[4]

    return {
        "fib_0236": retracement_level(w1s.price, w1t.price, FIB_236),
        "fib_0382": retracement_level(w1s.price, w1t.price, FIB_382),
        "fib_0500": retracement_level(w1s.price, w1t.price, FIB_500),
        "fib_0618": retracement_level(w1s.price, w1t.price, FIB_618),
        "fib_0786": retracement_level(w1s.price, w1t.price, FIB_786),
        "wave1_origin": w1s.price,
        "wave2_low": w2l.price,
        "wave3_top": w3t.price,
        "wave4_low": w4l.price,
        "wave3_target_1618": wave_3_target(w1s, w1t, w2l),
        "wave4_retrace_0382": wave_4_retracement_price(w3t, w2l),
        "wave5_target_1000": wave_5_target(w1s, w1t, w4l),
        "wave5_target_2618": wave_5_target(w1s, w1t, w4l, extended=True),
    }
