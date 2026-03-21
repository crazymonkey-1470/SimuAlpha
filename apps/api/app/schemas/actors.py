from pydantic import BaseModel, Field


class ActorSensitivity(BaseModel):
    factor: str
    weight: float = Field(description="Sensitivity magnitude, -1.0 to 1.0")


class ActorState(BaseModel):
    id: str = Field(description="Unique actor identifier")
    name: str = Field(description="Display name")
    archetype: str = Field(description="Actor class (e.g. trend_follower, mean_reverter)")
    bias: str = Field(description="Current directional bias: bullish, bearish, or neutral")
    conviction: float = Field(
        ge=0.0, le=1.0, description="Strength of current positioning conviction"
    )
    contribution: float = Field(
        description="Net contribution to aggregate pressure, -1.0 to 1.0"
    )
    horizon: str = Field(description="Operating time horizon")
    sensitivities: list[ActorSensitivity] = Field(
        description="Key factor sensitivities for this actor"
    )
    recent_change: str = Field(description="Description of most recent state transition")
    confidence: float = Field(
        ge=0.0, le=1.0, description="Model confidence in this actor's state estimate"
    )


class ActorStateResponse(BaseModel):
    actors: list[ActorState]
    actor_count: int
