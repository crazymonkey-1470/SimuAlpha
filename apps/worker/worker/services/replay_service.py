"""Replay generation service.

Thin wrapper around the engine's replay generation.
Uses the real simulation engine to generate each frame.
"""

from __future__ import annotations

import random

from worker.core.config import get_settings
from worker.core.logging import get_logger
from worker.engine.replay_engine import generate_replay_frame, generate_replay_range
from worker.schemas.replay import ReplayFrame

log = get_logger("svc.replay")


def generate_single_frame(
    target_date: str,
    seed: int | None = None,
) -> ReplayFrame:
    """Generate a replay frame for a specific date using the simulation engine."""
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
    """Generate replay frames for a range of dates using the simulation engine."""
    settings = get_settings()
    effective_seed = seed if seed is not None else (settings.seed or 42)

    log.info("Generating replay range %s to %s (seed=%s)", start, end, effective_seed)
    return generate_replay_range(effective_seed, start, end)
