"""Replay frame domain models aligned with API contracts."""

from __future__ import annotations

from pydantic import BaseModel, Field

from worker.schemas.actor import ActorState
from worker.schemas.scenario import ScenarioBranch


class ReplayFrame(BaseModel):
    date: str = Field(description="YYYY-MM-DD")
    regime: str = Field(description="Regime classification on this date")
    regime_confidence: float = Field(ge=0.0, le=1.0)
    net_pressure: float
    actor_states: list[ActorState] = Field(description="Actor snapshots for this date")
    scenario_branches: list[ScenarioBranch] = Field(description="Active scenarios on this date")
    realized_outcome: str | None = Field(default=None, description="What actually happened")
    notes: str = Field(description="Analyst commentary")
