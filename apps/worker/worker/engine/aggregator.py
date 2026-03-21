"""Actor output aggregation logic.

Combines individual agent outputs into aggregate market metrics:
- Net simulated pressure
- Dominant actor ranking
- Agreement/disagreement score
- Fragility score

These aggregates feed the regime engine and signal generator.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from worker.engine.agents.base import AgentOutput


class AggregateState(BaseModel):
    """Aggregated state derived from all actor outputs."""

    net_pressure: float = Field(ge=-1, le=1, description="Sum of actor contributions, clamped")
    dominant_actor: str = Field(description="Archetype with largest absolute contribution")
    dominant_contribution: float = Field(description="Absolute contribution of dominant actor")
    agreement_score: float = Field(ge=0, le=1, description="1 = all actors aligned, 0 = maximally divergent")
    fragility_score: float = Field(ge=0, le=1, description="0 = stable, 1 = fragile")
    bullish_count: int
    bearish_count: int
    neutral_count: int
    avg_conviction: float
    avg_confidence: float
    actor_outputs: list[AgentOutput]


def aggregate_actors(outputs: list[AgentOutput]) -> AggregateState:
    """Aggregate a list of agent outputs into a single AggregateState."""
    if not outputs:
        return AggregateState(
            net_pressure=0.0,
            dominant_actor="none",
            dominant_contribution=0.0,
            agreement_score=0.5,
            fragility_score=0.5,
            bullish_count=0,
            bearish_count=0,
            neutral_count=0,
            avg_conviction=0.0,
            avg_confidence=0.0,
            actor_outputs=[],
        )

    # ── Net pressure ─────────────────────────────────────────────────────
    raw_pressure = sum(o.contribution for o in outputs)
    net_pressure = max(-1.0, min(1.0, raw_pressure))

    # ── Dominant actor ───────────────────────────────────────────────────
    dominant = max(outputs, key=lambda o: abs(o.contribution))

    # ── Bias counts ──────────────────────────────────────────────────────
    bullish = sum(1 for o in outputs if o.bias == "bullish")
    bearish = sum(1 for o in outputs if o.bias == "bearish")
    neutral = sum(1 for o in outputs if o.bias == "neutral")

    # ── Agreement score ──────────────────────────────────────────────────
    # All same bias → 1.0, maximally split → 0.0
    n = len(outputs)
    max_count = max(bullish, bearish, neutral)
    agreement = max_count / n if n > 0 else 0.5

    # Also consider whether contributions point the same direction
    pos_contrib = sum(1 for o in outputs if o.contribution > 0.02)
    neg_contrib = sum(1 for o in outputs if o.contribution < -0.02)
    direction_alignment = abs(pos_contrib - neg_contrib) / n if n > 0 else 0.0

    # Blend bias agreement and contribution alignment
    agreement_score = 0.5 * agreement + 0.5 * direction_alignment

    # ── Fragility score ──────────────────────────────────────────────────
    # Fragility is high when:
    # 1. Actors disagree (low agreement)
    # 2. Average confidence is low
    # 3. Net pressure is near zero but individual contributions are large
    avg_confidence = sum(o.confidence for o in outputs) / n
    avg_conviction = sum(o.conviction for o in outputs) / n

    # Internal tension: large individual contributions but small net
    contrib_magnitudes = [abs(o.contribution) for o in outputs]
    total_magnitude = sum(contrib_magnitudes)
    cancellation = 1.0 - (abs(net_pressure) / max(0.01, total_magnitude))

    fragility = max(0.0, min(1.0,
        0.30 * (1 - agreement_score)     # Disagreement adds fragility
        + 0.25 * (1 - avg_confidence)    # Low confidence adds fragility
        + 0.25 * cancellation            # Internal cancellation adds fragility
        + 0.20 * (1 - abs(net_pressure)) # Indecision adds fragility
    ))

    return AggregateState(
        net_pressure=round(net_pressure, 3),
        dominant_actor=dominant.archetype,
        dominant_contribution=round(abs(dominant.contribution), 3),
        agreement_score=round(agreement_score, 3),
        fragility_score=round(fragility, 3),
        bullish_count=bullish,
        bearish_count=bearish,
        neutral_count=neutral,
        avg_conviction=round(avg_conviction, 3),
        avg_confidence=round(avg_confidence, 3),
        actor_outputs=outputs,
    )
