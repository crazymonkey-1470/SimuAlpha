"""Scenario branch domain models aligned with API contracts."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ActorReaction(BaseModel):
    actor_archetype: str
    expected_behavior: str


class ScenarioBranch(BaseModel):
    id: str = Field(description="Unique scenario identifier")
    name: str = Field(description="Short scenario label")
    probability: float = Field(ge=0.0, le=1.0, description="Estimated probability")
    direction: str = Field(description="Expected market direction")
    drivers: list[str] = Field(description="Catalysts or conditions")
    invalidation_conditions: list[str] = Field(description="Conditions that invalidate scenario")
    actor_reactions: list[ActorReaction] = Field(description="Expected actor behavior")
    risk_level: str = Field(description="low, moderate, elevated, high")
    notes: str = Field(description="Analyst notes")
