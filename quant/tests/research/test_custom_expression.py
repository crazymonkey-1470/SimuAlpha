"""DSL parser + evaluator tests."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from simualpha_quant.research.custom_expression import (
    DSLError,
    evaluate_dates,
    validate,
)


def _frame() -> pd.DataFrame:
    idx = pd.date_range("2020-01-01", periods=300, freq="B")
    close = np.linspace(10.0, 50.0, len(idx))
    return pd.DataFrame(
        {"open": close, "high": close, "low": close, "close": close, "volume": [1] * len(idx)},
        index=idx,
    )


def test_validate_rejects_unknown_operator():
    with pytest.raises(DSLError):
        validate({"magic": []})


def test_validate_rejects_non_dict():
    with pytest.raises(DSLError):
        validate([])  # type: ignore[arg-type]


def test_gt_against_close_always_false():
    # close monotone 10 → 50; gt vs literal 100 never fires.
    dates = evaluate_dates({"gt": {"a": "$close", "b": 100.0}}, _frame())
    assert dates == []


def test_gt_against_close_always_true():
    dates = evaluate_dates({"gt": {"a": "$close", "b": 5.0}}, _frame())
    assert len(dates) == 300


def test_distance_pct_against_sma():
    # close tracks a near-linear ramp; 5-day SMA is very close to close,
    # so distance_pct <= 0.01 should be true for most bars.
    expr = {
        "distance_pct": {
            "a": "$close",
            "b": {"sma": ["$close", 5, "daily"]},
            "max": 0.01,
        }
    }
    dates = evaluate_dates(expr, _frame())
    # The 5-day SMA needs 5 bars of warm-up before it's defined; after
    # that, close tracks the SMA closely, so ~60% of bars pass the 1% band.
    assert len(dates) > 100


def test_all_combinator_intersects():
    expr = {
        "all": [
            {"gt": {"a": "$close", "b": 15.0}},
            {"lt": {"a": "$close", "b": 30.0}},
        ]
    }
    dates = evaluate_dates(expr, _frame())
    # 15 < close < 30 — a strict subset of 300 bars.
    assert 0 < len(dates) < 300
