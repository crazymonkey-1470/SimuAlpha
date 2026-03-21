"""Actor state generation.

Produces ActorState objects with deterministic seeded variation.
Replace perturbation logic with real simulation when actor models
are connected.
"""

from __future__ import annotations

import random

from worker.core.logging import get_logger
from worker.data.seed_state import ACTOR_BASELINES
from worker.data.vocab import ACTOR_ARCHETYPES, BIASES, RECENT_CHANGE_PHRASES
from worker.schemas.actor import ActorSensitivity, ActorState

log = get_logger("gen.actor")


def generate_actors(rng: random.Random) -> list[ActorState]:
    """Generate the full set of actor states."""
    actors: list[ActorState] = []
    for spec in ACTOR_ARCHETYPES:
        archetype = spec["archetype"]
        baseline = ACTOR_BASELINES[archetype]
        actor = _generate_single(rng, spec, baseline)
        actors.append(actor)

    log.info("Generated %d actor states", len(actors))
    return actors


def _generate_single(
    rng: random.Random,
    spec: dict,
    baseline: dict,
) -> ActorState:
    archetype = spec["archetype"]

    conviction = _perturb(rng, baseline["conviction"], 0.10, 0.05, 0.98)
    contribution = _perturb(rng, baseline["contribution"], 0.08, -0.50, 0.50)
    confidence = _perturb(rng, baseline["confidence"], 0.06, 0.40, 0.98)

    # Bias can shift from baseline with some probability
    bias = baseline["bias"]
    if rng.random() < 0.20:
        bias = rng.choice(BIASES)

    recent_change = _pick_recent_change(rng, archetype, conviction)

    sensitivities = [
        ActorSensitivity(factor=s["factor"], weight=s["weight"])
        for s in spec["sensitivities"]
    ]

    return ActorState(
        id=spec["id"],
        name=spec["name"],
        archetype=archetype,
        bias=bias,
        conviction=round(conviction, 2),
        contribution=round(contribution, 2),
        horizon=spec["horizon"],
        sensitivities=sensitivities,
        recent_change=recent_change,
        confidence=round(confidence, 2),
    )


def _perturb(
    rng: random.Random, base: float, scale: float, lo: float, hi: float
) -> float:
    return max(lo, min(hi, base + rng.gauss(0, scale)))


def _pick_recent_change(
    rng: random.Random, archetype: str, conviction: float
) -> str:
    phrases = RECENT_CHANGE_PHRASES.get(archetype, ["State unchanged from prior period"])
    phrase = rng.choice(phrases)
    return (
        phrase
        .replace("{prev:.2f}", f"{conviction + rng.uniform(0.05, 0.20):.2f}")
        .replace("{pct}", f"{rng.uniform(1.5, 3.5):.1f}")
    )
