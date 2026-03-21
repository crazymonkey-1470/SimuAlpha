"""Scenario branch generation.

Produces ScenarioBranch objects with deterministic seeded probabilities.
Replace with model-driven scenario inference when available.
"""

from __future__ import annotations

import random

from worker.core.logging import get_logger
from worker.data.seed_state import SCENARIO_BASELINE_PROBS
from worker.data.vocab import ACTOR_REACTIONS, SCENARIO_TEMPLATES
from worker.schemas.scenario import ActorReaction, ScenarioBranch

log = get_logger("gen.scenario")


def generate_scenarios(rng: random.Random) -> tuple[list[ScenarioBranch], str]:
    """Generate scenario branches and return (scenarios, base_case_id)."""
    raw_probs: dict[str, float] = {}
    for tmpl in SCENARIO_TEMPLATES:
        suffix = tmpl["id_suffix"]
        base_prob = SCENARIO_BASELINE_PROBS.get(suffix, 0.15)
        lo, hi = tmpl["prob_range"]
        raw_probs[suffix] = max(lo, min(hi, base_prob + rng.gauss(0, 0.05)))

    # Normalize so they sum to 1.0
    total = sum(raw_probs.values())
    probs = {k: v / total for k, v in raw_probs.items()}

    scenarios: list[ScenarioBranch] = []
    for tmpl in SCENARIO_TEMPLATES:
        suffix = tmpl["id_suffix"]
        scenario = _build_scenario(rng, tmpl, probs[suffix])
        scenarios.append(scenario)

    base_case_id = f"scenario-{SCENARIO_TEMPLATES[0]['id_suffix']}"
    log.info(
        "Generated %d scenarios; base case=%s (%.0f%%)",
        len(scenarios),
        base_case_id,
        probs[SCENARIO_TEMPLATES[0]["id_suffix"]] * 100,
    )
    return scenarios, base_case_id


def _build_scenario(
    rng: random.Random,
    tmpl: dict,
    probability: float,
) -> ScenarioBranch:
    suffix = tmpl["id_suffix"]
    reactions_map = ACTOR_REACTIONS.get(suffix, {})
    actor_reactions = [
        ActorReaction(actor_archetype=arch, expected_behavior=behavior)
        for arch, behavior in reactions_map.items()
    ]

    notes_variants = [
        tmpl.get("notes", ""),
        f"Probability adjusted based on current actor positioning and vol regime.",
        f"Market structure {'supports' if probability > 0.3 else 'does not favor'} this outcome at present.",
    ]
    notes = rng.choice([n for n in notes_variants if n]) if notes_variants else ""

    return ScenarioBranch(
        id=f"scenario-{suffix}",
        name=tmpl["name"],
        probability=round(probability, 2),
        direction=tmpl["direction"],
        drivers=tmpl["drivers"],
        invalidation_conditions=tmpl["invalidation"],
        actor_reactions=actor_reactions,
        risk_level=tmpl["risk_level"],
        notes=notes,
    )
