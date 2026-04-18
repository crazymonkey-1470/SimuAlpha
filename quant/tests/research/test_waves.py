"""Wave detection + impulse validation tests."""

from __future__ import annotations

import pandas as pd

from simualpha_quant.research.waves import (
    detect_pivots,
    find_completed_impulses,
    find_developing_wave_2,
    find_developing_wave_4,
)


def test_initial_low_is_emitted(clean_five_wave_impulse: pd.DataFrame):
    # Bug regression: the JS ZigZag never emits the very first low;
    # our version must.
    pivots = detect_pivots(clean_five_wave_impulse["close"], sensitivity=0.05)
    assert pivots, "at least one pivot expected"
    assert pivots[0].type == "LOW", f"first pivot should be the W1 start low, got {pivots[0]}"
    assert abs(pivots[0].price - 100.0) < 1e-6


def test_clean_impulse_produces_five_waves(clean_five_wave_impulse: pd.DataFrame):
    pivots = detect_pivots(clean_five_wave_impulse["close"], sensitivity=0.05)
    impulses = find_completed_impulses(pivots)
    assert len(impulses) >= 1
    imp = impulses[0]
    assert imp.wave1.length == 30.0
    assert imp.wave3.length >= imp.wave1.length  # rule 2 held
    assert imp.wave2.end.price > imp.wave1.start.price  # rule 1 held
    assert imp.wave4.end.price > imp.wave1.end.price  # rule 3 held


def test_rule_1_violator_produces_no_impulse(rule_1_violator: pd.DataFrame):
    pivots = detect_pivots(rule_1_violator["close"], sensitivity=0.05)
    impulses = find_completed_impulses(pivots)
    assert impulses == []


def test_flat_series_produces_no_waves(no_pattern: pd.DataFrame):
    pivots = detect_pivots(no_pattern["close"], sensitivity=0.05)
    assert find_completed_impulses(pivots) == []
    assert find_developing_wave_2(pivots) == []
    assert find_developing_wave_4(pivots) == []
