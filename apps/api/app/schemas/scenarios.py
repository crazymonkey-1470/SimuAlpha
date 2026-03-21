from pydantic import BaseModel, Field


class ActorReaction(BaseModel):
    actor_archetype: str
    expected_behavior: str


class ScenarioBranch(BaseModel):
    id: str = Field(description="Unique scenario identifier")
    name: str = Field(description="Short scenario label")
    probability: float = Field(
        ge=0.0, le=1.0, description="Estimated probability of this scenario"
    )
    direction: str = Field(description="Expected market direction under this scenario")
    drivers: list[str] = Field(description="Catalysts or conditions that trigger this branch")
    invalidation_conditions: list[str] = Field(
        description="Conditions that would invalidate this scenario"
    )
    actor_reactions: list[ActorReaction] = Field(
        description="Expected actor behavior under this scenario"
    )
    risk_level: str = Field(description="Risk severity: low, moderate, elevated, high")
    notes: str = Field(description="Analyst notes on this scenario")


class ScenarioResponse(BaseModel):
    scenarios: list[ScenarioBranch]
    base_case_id: str = Field(description="ID of the scenario designated as base case")
