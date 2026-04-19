"""Fibonacci-level math — pure formula tests, no series needed."""

from __future__ import annotations

from datetime import date

from simualpha_quant.research.fibonacci import (
    extension_level,
    retracement_level,
    wave_1_retracement_levels,
    wave_2_entry_band,
    wave_3_target,
    wave_4_retracement_price,
    wave_5_target,
)
from simualpha_quant.research.waves import Pivot
from simualpha_quant.tli_constants import (
    FIB_382,
    FIB_500,
    FIB_618,
    FIB_786,
    FIB_1618,
)


def _p(name: str, price: float, typ: str = "LOW") -> Pivot:
    return Pivot(index=0, date=date(2024, 1, 1), price=price, type=typ)


def test_retracement_math():
    # Impulse from 100 to 200: 0.618 retrace = 200 - 0.618*(200-100) = 138.2
    assert retracement_level(100.0, 200.0, FIB_618) == 200.0 - 61.8
    assert retracement_level(100.0, 200.0, FIB_500) == 150.0
    assert retracement_level(100.0, 200.0, FIB_382) == 200.0 - 38.2


def test_extension_math():
    # Anchor 150 + 1.618 * 100 height = 311.8
    assert extension_level(100.0, 150.0, 100.0, FIB_1618) == 150.0 + 161.8


def test_wave_1_retracement_levels_all_present():
    w1s = _p("w1s", 100.0)
    w1t = _p("w1t", 200.0, "HIGH")
    levels = wave_1_retracement_levels(w1s, w1t)
    # 5 standard levels: 0.236, 0.382, 0.5, 0.618, 0.786
    assert set(levels.keys()) == {0.236, FIB_382, FIB_500, FIB_618, FIB_786}
    assert levels[FIB_500] == 150.0
    assert abs(levels[FIB_618] - 138.2) < 1e-6


def test_wave_2_entry_band_is_0p5_to_0p618():
    w1s = _p("w1s", 100.0)
    w1t = _p("w1t", 200.0, "HIGH")
    low, high = wave_2_entry_band(w1s, w1t)
    # 0.618 → price 138.2; 0.5 → price 150
    assert abs(low - 138.2) < 1e-6
    assert abs(high - 150.0) < 1e-6
    assert low < high


def test_wave_3_target_formula():
    w1s = _p("w1s", 100.0)
    w1t = _p("w1t", 130.0, "HIGH")
    w2l = _p("w2l", 115.0)
    # 115 + 1.618 * 30 = 163.54
    assert abs(wave_3_target(w1s, w1t, w2l) - 163.54) < 1e-6


def test_wave_4_retracement_price():
    w3t = _p("w3t", 165.0, "HIGH")
    w2l = _p("w2l", 115.0)
    # 165 - 0.382 * (165 - 115) = 145.9
    assert abs(wave_4_retracement_price(w3t, w2l) - 145.9) < 1e-6


def test_wave_5_target_base_vs_extended():
    w1s = _p("w1s", 100.0)
    w1t = _p("w1t", 130.0, "HIGH")
    w4l = _p("w4l", 145.0)
    base = wave_5_target(w1s, w1t, w4l, extended=False)
    ext = wave_5_target(w1s, w1t, w4l, extended=True)
    # base = w4_low + 1.0 * (130 - 100) = 175
    # ext  = w4_low + 2.618 * 30         = 223.54
    assert abs(base - 175.0) < 1e-6
    assert abs(ext - 223.54) < 1e-6
