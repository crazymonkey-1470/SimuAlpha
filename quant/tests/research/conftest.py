"""Fixtures shared by research-layer tests.

Each fixture synthesizes a small OHLCV series that exercises a specific
aspect of the detectors without hitting Supabase or OpenBB.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest


def _leg(start: float, end: float, n: int) -> list[float]:
    return list(np.linspace(start, end, n))[1:]


def _to_frame(prices: list[float], start: str = "2020-01-01") -> pd.DataFrame:
    idx = pd.date_range(start, periods=len(prices), freq="B")
    return pd.DataFrame(
        {
            "open":   prices,
            "high":   [p * 1.005 for p in prices],
            "low":    [p * 0.995 for p in prices],
            "close":  prices,
            "volume": [1_000_000] * len(prices),
        },
        index=idx,
    )


@pytest.fixture()
def clean_five_wave_impulse() -> pd.DataFrame:
    """A textbook 5-wave impulse with known pivot levels."""
    prices = [100.0]
    prices += _leg(100, 130, 30)   # W1 up (+30)
    prices += _leg(130, 115, 15)   # W2 down (50% retrace → 115 = 0.5 of W1)
    prices += _leg(115, 165, 50)   # W3 up (+50, >1.0x W1)
    prices += _leg(165, 145, 20)   # W4 down (145 > W1 top of 130 ✓)
    prices += _leg(145, 195, 50)   # W5 up
    # Extra forward action so forward-return windows have data.
    prices += list(np.linspace(195, 250, 250))
    return _to_frame(prices)


@pytest.fixture()
def rule_1_violator() -> pd.DataFrame:
    """Wave 2 retraces BELOW Wave 1 start — impulse should fail hard rule 1."""
    prices = [100.0]
    prices += _leg(100, 130, 30)
    prices += _leg(130, 90, 20)    # W2 dives to 90 < W1 start 100
    prices += _leg(90, 150, 40)
    prices += _leg(150, 130, 15)
    prices += _leg(130, 180, 40)
    prices += list(np.linspace(180, 200, 100))
    return _to_frame(prices)


@pytest.fixture()
def no_pattern() -> pd.DataFrame:
    """A flat series — should produce zero signals for every detector."""
    prices = [100.0 + 0.05 * (i % 10) for i in range(500)]
    return _to_frame(prices)
