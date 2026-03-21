from pydantic import BaseModel, Field

from app.schemas.actors import ActorState
from app.schemas.scenarios import ScenarioBranch


class ReplayFrame(BaseModel):
    date: str = Field(description="Replay date (YYYY-MM-DD)")
    regime: str = Field(description="Regime classification on this date")
    regime_confidence: float = Field(ge=0.0, le=1.0)
    net_pressure: float
    actor_states: list[ActorState] = Field(description="Actor snapshots for this date")
    scenario_branches: list[ScenarioBranch] = Field(
        description="Active scenario branches on this date"
    )
    realized_outcome: str | None = Field(
        default=None,
        description="What actually happened (populated for historical dates)",
    )
    notes: str = Field(description="Analyst commentary for this replay frame")
