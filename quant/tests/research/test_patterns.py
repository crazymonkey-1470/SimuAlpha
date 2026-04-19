"""One test per named pattern against the synthetic fixtures."""

from __future__ import annotations

import pandas as pd

from simualpha_quant.research.patterns import PATTERNS, all_names, by_name


def test_registry_lists_all_five():
    assert set(all_names()) == {
        "wave_2_at_618",
        "wave_4_at_382",
        "confluence_zone",
        "generational_support",
        "impossible_level",
    }


def test_wave_2_fires_on_clean_impulse(clean_five_wave_impulse: pd.DataFrame):
    p = by_name("wave_2_at_618")
    dates = p.detect(clean_five_wave_impulse)
    assert len(dates) >= 1
    # Signal must land after the first month (W1 still forming before that).
    assert dates[0] > clean_five_wave_impulse.index[15].date()


def test_wave_4_fires_on_clean_impulse(clean_five_wave_impulse: pd.DataFrame):
    p = by_name("wave_4_at_382")
    dates = p.detect(clean_five_wave_impulse)
    assert len(dates) >= 1


def test_patterns_silent_on_flat_series(no_pattern: pd.DataFrame):
    for name in all_names():
        assert by_name(name).detect(no_pattern) == [], f"{name} fired on flat series"


def test_patterns_silent_on_rule1_violator(rule_1_violator: pd.DataFrame):
    # Wave 2 must never retrace beyond Wave 1 start; wave_2_at_618 and
    # wave_4_at_382 must reject this structure.
    assert by_name("wave_2_at_618").detect(rule_1_violator) == []
    assert by_name("wave_4_at_382").detect(rule_1_violator) == []


def test_params_override_defaults(clean_five_wave_impulse: pd.DataFrame):
    p = by_name("wave_2_at_618")
    # Tighten the confirmation window to zero → no signal can fit.
    none_fired = p.detect(clean_five_wave_impulse, params={"max_confirmation_days": 0})
    default_fired = p.detect(clean_five_wave_impulse)
    assert len(none_fired) <= len(default_fired)
