"""Replay frame generation.

Produces ReplayFrame objects for historical dates with synthetic
but plausible state snapshots. Replace with real historical
reconstruction when calibration data is available.
"""

from __future__ import annotations

import random

from worker.core.logging import get_logger
from worker.data.vocab import REGIME_LABELS
from worker.generators.actor_generator import generate_actors
from worker.generators.scenario_generator import generate_scenarios
from worker.schemas.replay import ReplayFrame

log = get_logger("gen.replay")

# Synthetic realized outcomes for historical context
_OUTCOMES: list[str] = [
    "Range compression held through the session. SPX moved {bps}bps with declining volume.",
    "Moderate sell-off materialized as dealer gamma flipped negative. VIX rose {vix_chg}.",
    "Continuation pattern played out as expected. Passive flows absorbed supply throughout the session.",
    "Sharp reversal intraday; initial weakness bought aggressively near support levels.",
    "Low-volume consolidation; no significant directional resolution.",
    "Trend acceleration on positive macro surprise; breadth confirmed move.",
    "Choppy session with multiple reversals; no actor class achieved dominance.",
]


def generate_replay_frame(
    rng: random.Random,
    date: str,
    include_outcome: bool = True,
) -> ReplayFrame:
    """Generate a historical replay frame for the given date.

    Uses the date string as an additional seed component so the same
    date always produces the same frame for a given base seed.
    """
    # Derive a date-specific sub-seed for reproducibility
    date_seed = sum(ord(c) for c in date)
    date_rng = random.Random(rng.randint(0, 2**31) ^ date_seed)

    regime = date_rng.choice(REGIME_LABELS[:7])
    confidence = round(max(0.35, min(0.95, 0.70 + date_rng.gauss(0, 0.12))), 2)
    net_pressure = round(max(-0.50, min(0.50, 0.10 + date_rng.gauss(0, 0.15))), 2)

    actors = generate_actors(date_rng)
    # Use a subset of actors for replay to simulate sparse historical data
    actors = date_rng.sample(actors, k=min(date_rng.randint(3, 5), len(actors)))

    scenarios, _ = generate_scenarios(date_rng)
    # Fewer scenarios in historical views
    scenarios = scenarios[:date_rng.randint(1, 3)]

    outcome: str | None = None
    if include_outcome:
        template = date_rng.choice(_OUTCOMES)
        outcome = (
            template
            .replace("{bps}", str(date_rng.randint(5, 45)))
            .replace("{vix_chg}", f"{date_rng.uniform(0.5, 3.5):.1f} points")
        )

    notes_options = [
        f"Historical snapshot for {date}. Actor positioning reflects model state at close.",
        f"Replay frame generated from simulation state at {date} EOD.",
        f"Pre-event positioning captured; realized outcome {'confirmed' if outcome else 'pending'}.",
    ]

    frame = ReplayFrame(
        date=date,
        regime=regime,
        regime_confidence=confidence,
        net_pressure=net_pressure,
        actor_states=actors,
        scenario_branches=scenarios,
        realized_outcome=outcome,
        notes=date_rng.choice(notes_options),
    )

    log.info("Generated replay frame for %s (regime=%s)", date, regime)
    return frame
