"""Replay generation service.

Produces historical replay frames for a given date or date range.
Uses deterministic seeded generation so the same date always
produces the same frame.
"""

from __future__ import annotations

import random
from datetime import date, timedelta

from worker.core.config import get_settings
from worker.core.logging import get_logger
from worker.generators.replay_generator import generate_replay_frame
from worker.schemas.replay import ReplayFrame

log = get_logger("svc.replay")


def generate_single_frame(
    target_date: str,
    seed: int | None = None,
) -> ReplayFrame:
    """Generate a replay frame for a specific date."""
    settings = get_settings()
    effective_seed = seed if seed is not None else settings.seed
    rng = random.Random(effective_seed)

    log.info("Generating replay frame for %s (seed=%s)", target_date, effective_seed)
    return generate_replay_frame(rng, target_date)


def generate_date_range(
    start: str,
    end: str,
    seed: int | None = None,
) -> list[ReplayFrame]:
    """Generate replay frames for a range of dates (inclusive)."""
    settings = get_settings()
    effective_seed = seed if seed is not None else settings.seed
    rng = random.Random(effective_seed)

    start_date = date.fromisoformat(start)
    end_date = date.fromisoformat(end)
    dates: list[str] = []
    current = start_date
    while current <= end_date:
        # Skip weekends
        if current.weekday() < 5:
            dates.append(current.isoformat())
        current += timedelta(days=1)

    log.info("Generating %d replay frames (%s to %s)", len(dates), start, end)
    frames = [generate_replay_frame(rng, d) for d in dates]
    return frames
