"""Actor state domain models aligned with API contracts."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ActorSensitivity(BaseModel):
    factor: str
    weight: float = Field(description="Sensitivity magnitude, -1.0 to 1.0")


class ActorState(BaseModel):
    id: str = Field(description="Unique actor identifier")
    name: str = Field(description="Display name")
    archetype: str = Field(description="Actor class")
    bias: str = Field(description="bullish, bearish, or neutral")
    conviction: float = Field(ge=0.0, le=1.0, description="Positioning conviction")
    contribution: float = Field(description="Net contribution to aggregate pressure, -1.0 to 1.0")
    horizon: str = Field(description="Operating time horizon")
    sensitivities: list[ActorSensitivity] = Field(description="Factor sensitivities")
    recent_change: str = Field(description="Most recent state transition")
    confidence: float = Field(ge=0.0, le=1.0, description="Model confidence in state estimate")
