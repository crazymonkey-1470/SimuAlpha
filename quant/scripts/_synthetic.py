"""Per-fixture synthetic price series, calibrated from the fixture's
own wave_labels / fibonacci_levels / horizontal_lines so annotations
land in the visible chart area.

Used by both `scripts/generate_fixtures.py` and the visual regression
test (`tests/charts/test_visual_regression.py`) so reference PNGs and
test renders match exactly.
"""

from __future__ import annotations

from datetime import date as date_t

import numpy as np
import pandas as pd

from simualpha_quant.schemas.charts import RenderChartRequest


def _waypoints(req: RenderChartRequest) -> list[tuple[pd.Timestamp, float]]:
    pts: list[tuple[pd.Timestamp, float]] = []
    start = pd.Timestamp(req.date_range.start)
    end = pd.Timestamp(req.date_range.end)
    for w in req.annotations.wave_labels:
        ts = pd.Timestamp(w.date)
        if start <= ts <= end:
            pts.append((ts, float(w.price)))
    pts.sort(key=lambda p: p[0])
    return pts


def _interpolate(daily_idx: pd.DatetimeIndex, waypoints: list[tuple[pd.Timestamp, float]]) -> np.ndarray:
    if not waypoints:
        return None  # type: ignore[return-value]
    if len(waypoints) == 1:
        return np.full(len(daily_idx), waypoints[0][1], dtype=float)
    xs = np.array([(p[0] - daily_idx[0]).days for p in waypoints], dtype=float)
    ys = np.array([p[1] for p in waypoints], dtype=float)
    days = np.array([(d - daily_idx[0]).days for d in daily_idx], dtype=float)
    return np.interp(days, xs, ys)


def _ohlcv_from_close(close: np.ndarray, idx: pd.DatetimeIndex) -> pd.DataFrame:
    rng = np.random.default_rng(seed=42)
    noise = rng.normal(0.0, 0.005, size=len(close))
    closes = close * (1.0 + noise)
    body = np.abs(rng.normal(0.0, 0.006, size=len(close))) * closes
    wick = np.abs(rng.normal(0.0, 0.012, size=len(close))) * closes
    opens = closes - body * np.where(rng.random(len(close)) > 0.5, 1.0, -1.0)
    highs = np.maximum(opens, closes) + wick
    lows = np.minimum(opens, closes) - wick
    volumes = (1_500_000 + rng.integers(0, 800_000, size=len(close))).astype(int)
    return pd.DataFrame(
        {
            "open": opens,
            "high": highs,
            "low": lows,
            "close": closes,
            "volume": volumes,
        },
        index=idx,
    )


def _expected_range(req: RenderChartRequest) -> tuple[float, float]:
    candidates: list[float] = []
    for w in req.annotations.wave_labels:
        candidates.append(w.price)
    for f in req.annotations.fibonacci_levels:
        candidates.append(f.price)
    for h in req.annotations.horizontal_lines:
        candidates.append(h.price)
    for z in req.annotations.zones:
        candidates.extend([z.low, z.high])
    if not candidates:
        return (10.0, 30.0)
    lo, hi = min(candidates), max(candidates)
    pad = (hi - lo) * 0.12 if hi > lo else max(1.0, hi * 0.05)
    return (lo - pad, hi + pad)


def synthetic_for(req: RenderChartRequest) -> pd.DataFrame:
    """Build a deterministic synthetic series tailored to a fixture.

    Strategy:
    1. Compute waypoints from wave_labels (price+date pairs).
    2. Linearly interpolate a close-price path through them.
    3. If no wave_labels are present, draw a smooth oscillator that
       spans the implied price range from other annotations.
    4. Manufacture OHLCV from the close path with deterministic noise.
    """
    start = pd.Timestamp(req.date_range.start)
    end = pd.Timestamp(req.date_range.end)
    idx = pd.date_range(start, end, freq="B")

    pts = _waypoints(req)
    if pts:
        # Anchor the first day at the first waypoint and the last day at the last.
        if pts[0][0] != idx[0]:
            pts.insert(0, (idx[0], pts[0][1] * 0.95))
        if pts[-1][0] != idx[-1]:
            pts.append((idx[-1], pts[-1][1] * 1.05))
        close = _interpolate(idx, pts)
    else:
        lo, hi = _expected_range(req)
        n = len(idx)
        # Slow downtrend from hi → lo with a sine ripple — fits the
        # GENERATIONAL SUPPORT story in the NKE fixture.
        t = np.linspace(0, 1, n)
        ripple = 0.05 * (hi - lo) * np.sin(t * 6 * np.pi)
        close = (hi - (hi - lo) * t) + ripple

    return _ohlcv_from_close(close, idx)
