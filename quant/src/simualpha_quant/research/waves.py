"""Swing-point detection + Elliott Wave labeling.

Pure NumPy / pandas. No qlib, no matplotlib, no Supabase. The output
of this module feeds the pattern detectors in
``simualpha_quant.research.patterns``.

Approach mirrors the existing JS implementation in
``backend/services/elliott_wave.js`` (ZigZag pivot detection +
forward-walking impulse / corrective validator), but produces a
Python-native typed result the detectors can iterate.

CONVENTION: heavy imports (none here) and no module-load side effects.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

import numpy as np
import pandas as pd

from simualpha_quant.tli_constants import (
    PIVOT_SENSITIVITY_INTERMEDIATE,
    PIVOT_SENSITIVITY_PRIMARY,
)

PivotType = Literal["HIGH", "LOW"]
WaveLabelName = Literal["W1", "W2", "W3", "W4", "W5", "WA", "WB", "WC"]


@dataclass(frozen=True)
class Pivot:
    index: int          # position in the input series
    date: date
    price: float
    type: PivotType


@dataclass(frozen=True)
class Wave:
    label: WaveLabelName
    start: Pivot
    end: Pivot

    @property
    def length(self) -> float:
        """Absolute price travel of the wave."""
        return abs(self.end.price - self.start.price)

    @property
    def direction(self) -> Literal["up", "down"]:
        return "up" if self.end.price > self.start.price else "down"


@dataclass(frozen=True)
class ImpulseStructure:
    """A validated 5-wave impulse anchored on 6 pivots (low,high,low,high,low,high)."""
    pivots: tuple[Pivot, Pivot, Pivot, Pivot, Pivot, Pivot]
    waves: tuple[Wave, Wave, Wave, Wave, Wave]  # W1..W5

    @property
    def wave1(self) -> Wave: return self.waves[0]
    @property
    def wave2(self) -> Wave: return self.waves[1]
    @property
    def wave3(self) -> Wave: return self.waves[2]
    @property
    def wave4(self) -> Wave: return self.waves[3]
    @property
    def wave5(self) -> Wave: return self.waves[4]


# ─────────────────────────── pivot detection ───────────────────────────


def detect_pivots(prices: pd.Series, sensitivity: float) -> list[Pivot]:
    """ZigZag pivot detection.

    A new pivot is confirmed when price retraces ``sensitivity`` (as a
    fraction) from the running extreme since the last pivot. Mirrors
    ``backend/services/elliott_wave.js:detectPivots``.

    Args:
        prices: pd.Series of close prices indexed by date (ascending).
        sensitivity: 0.15 for primary (monthly) degree,
                     0.08 for intermediate (weekly) degree.
                     Use the constants in ``tli_constants``.

    Returns:
        List of Pivot in chronological order.
    """
    if len(prices) < 10:
        return []
    if not isinstance(prices.index, pd.DatetimeIndex):
        raise TypeError("prices must have a DatetimeIndex")

    values = prices.to_numpy(dtype=float)
    dates = [pd.Timestamp(t).date() for t in prices.index]

    pivots: list[Pivot] = []
    direction: Literal["up", "down"] | None = None
    last_high_price = -np.inf
    last_high_idx = 0
    last_low_price = np.inf
    last_low_idx = 0
    initial_pivot: Pivot | None = None  # held back until we know its type

    for i in range(1, len(values)):
        curr = values[i]
        prev = values[i - 1]
        if not (np.isfinite(curr) and np.isfinite(prev)):
            continue

        if direction is None:
            if curr > prev:
                direction = "up"
                last_low_price = prev
                last_low_idx = i - 1
                initial_pivot = Pivot(
                    index=last_low_idx,
                    date=dates[last_low_idx],
                    price=float(last_low_price),
                    type="LOW",
                )
            else:
                direction = "down"
                last_high_price = prev
                last_high_idx = i - 1
                initial_pivot = Pivot(
                    index=last_high_idx,
                    date=dates[last_high_idx],
                    price=float(last_high_price),
                    type="HIGH",
                )
            continue

        if direction == "up":
            if curr > last_high_price:
                last_high_price = curr
                last_high_idx = i
            elif last_high_price > 0 and (last_high_price - curr) / last_high_price >= sensitivity:
                # Emit the initial-low pivot once the first reversal is confirmed.
                if initial_pivot is not None and initial_pivot.type == "LOW":
                    pivots.append(initial_pivot)
                    initial_pivot = None
                pivots.append(
                    Pivot(
                        index=last_high_idx,
                        date=dates[last_high_idx],
                        price=float(last_high_price),
                        type="HIGH",
                    )
                )
                direction = "down"
                last_low_price = curr
                last_low_idx = i
        else:  # direction == "down"
            if curr < last_low_price:
                last_low_price = curr
                last_low_idx = i
            elif last_low_price > 0 and (curr - last_low_price) / last_low_price >= sensitivity:
                if initial_pivot is not None and initial_pivot.type == "HIGH":
                    pivots.append(initial_pivot)
                    initial_pivot = None
                pivots.append(
                    Pivot(
                        index=last_low_idx,
                        date=dates[last_low_idx],
                        price=float(last_low_price),
                        type="LOW",
                    )
                )
                direction = "up"
                last_high_price = curr
                last_high_idx = i

    # Append the last unconfirmed pivot for downstream callers that
    # want the latest swing even if not yet retraced.
    if direction == "up" and np.isfinite(last_high_price):
        pivots.append(
            Pivot(index=last_high_idx, date=dates[last_high_idx], price=float(last_high_price), type="HIGH")
        )
    elif direction == "down" and np.isfinite(last_low_price):
        pivots.append(
            Pivot(index=last_low_idx, date=dates[last_low_idx], price=float(last_low_price), type="LOW")
        )

    return pivots


def sensitivity_for_timeframe(timeframe: str) -> float:
    """Map a timeframe label to a default pivot sensitivity."""
    if timeframe in {"monthly", "primary"}:
        return PIVOT_SENSITIVITY_PRIMARY
    if timeframe in {"weekly", "intermediate"}:
        return PIVOT_SENSITIVITY_INTERMEDIATE
    # Daily — use the intermediate setting; finer detection is handled
    # at the pattern level via tolerance parameters.
    return PIVOT_SENSITIVITY_INTERMEDIATE


# ─────────────────────────── impulse validation ────────────────────────


def _is_alternating(p0: Pivot, p1: Pivot, p2: Pivot, p3: Pivot, p4: Pivot, p5: Pivot) -> bool:
    """Verify the 6 pivots alternate LOW-HIGH-LOW-HIGH-LOW-HIGH."""
    expected: tuple[PivotType, ...] = ("LOW", "HIGH", "LOW", "HIGH", "LOW", "HIGH")
    return (p0.type, p1.type, p2.type, p3.type, p4.type, p5.type) == expected


def find_completed_impulses(pivots: list[Pivot]) -> list[ImpulseStructure]:
    """Return every valid 5-wave impulse anchored on a sliding 6-pivot window.

    Hard rules enforced (per TLI spec, see docs/tli-constants.md §14):

    - Rule 1: ``wave2_low > wave1_start``
    - Rule 2: ``wave3_length >= max(wave1, wave5)`` — Wave 3 never the
      shortest.
    - Rule 3: ``wave4_low > wave1_top``
    """
    out: list[ImpulseStructure] = []
    for i in range(len(pivots) - 5):
        p0, p1, p2, p3, p4, p5 = pivots[i : i + 6]
        if not _is_alternating(p0, p1, p2, p3, p4, p5):
            continue

        # Rule 1: Wave 2 low must stay above Wave 1 start.
        if p2.price <= p0.price:
            continue
        # Rule 3: Wave 4 low must stay above Wave 1 top.
        if p4.price <= p1.price:
            continue
        # Rule 2: Wave 3 not shortest.
        w1_len = p1.price - p0.price
        w3_len = p3.price - p2.price
        w5_len = p5.price - p4.price
        if w1_len <= 0 or w3_len <= 0 or w5_len <= 0:
            continue
        if w3_len < w1_len and w3_len < w5_len:
            continue

        waves = (
            Wave("W1", p0, p1),
            Wave("W2", p1, p2),
            Wave("W3", p2, p3),
            Wave("W4", p3, p4),
            Wave("W5", p4, p5),
        )
        out.append(ImpulseStructure(pivots=(p0, p1, p2, p3, p4, p5), waves=waves))
    return out


def find_developing_wave_2(pivots: list[Pivot]) -> list[tuple[Pivot, Pivot, Pivot]]:
    """Find every (W1_start_low, W1_top_high, W2_low) triple in progress.

    Used by ``wave_2_at_618`` to detect setups *before* a Wave 3 has
    confirmed. Enforces only Rule 1 (W2 low above W1 start).

    Returns chronological triples; the third pivot is the candidate
    Wave 2 low. Subsequent price action is what the detector evaluates.
    """
    out: list[tuple[Pivot, Pivot, Pivot]] = []
    for i in range(len(pivots) - 2):
        p0, p1, p2 = pivots[i : i + 3]
        if (p0.type, p1.type, p2.type) != ("LOW", "HIGH", "LOW"):
            continue
        if p2.price <= p0.price:  # Rule 1
            continue
        if p1.price <= p0.price:  # Wave 1 must travel up
            continue
        out.append((p0, p1, p2))
    return out


def find_developing_wave_4(pivots: list[Pivot]) -> list[tuple[Pivot, Pivot, Pivot, Pivot, Pivot]]:
    """Find every (W1_start, W1_top, W2_low, W3_top, W4_low) anchor.

    Used by ``wave_4_at_382``. Enforces all three impulse hard rules so
    far (W2 low > W1 start, W4 low > W1 top, W3 not shortest yet known).
    """
    out: list[tuple[Pivot, Pivot, Pivot, Pivot, Pivot]] = []
    for i in range(len(pivots) - 4):
        p0, p1, p2, p3, p4 = pivots[i : i + 5]
        if (p0.type, p1.type, p2.type, p3.type, p4.type) != (
            "LOW", "HIGH", "LOW", "HIGH", "LOW"
        ):
            continue
        if p2.price <= p0.price:  # Rule 1
            continue
        if p4.price <= p1.price:  # Rule 3
            continue
        w1 = p1.price - p0.price
        w3 = p3.price - p2.price
        if w1 <= 0 or w3 <= 0:
            continue
        # Rule 2 partially: W3 must at least not be shorter than W1
        # (W5 unknown at this stage).
        if w3 < w1:
            continue
        out.append((p0, p1, p2, p3, p4))
    return out
