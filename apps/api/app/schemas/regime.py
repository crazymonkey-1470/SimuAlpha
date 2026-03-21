from datetime import datetime

from pydantic import BaseModel, Field


class RegimeDriver(BaseModel):
    factor: str = Field(description="Name of the driving factor")
    influence: float = Field(description="Influence weight, -1.0 to 1.0")
    description: str = Field(description="Human-readable explanation of the driver's effect")


class RegimeSnapshot(BaseModel):
    regime: str = Field(description="Current regime classification")
    confidence: float = Field(ge=0.0, le=1.0, description="Model confidence in regime assignment")
    net_pressure: float = Field(
        description="Aggregate directional pressure across actors, -1.0 (bearish) to 1.0 (bullish)"
    )
    posture: str = Field(description="Recommended portfolio posture")
    risk_flags: list[str] = Field(description="Active risk warnings")
    drivers: list[RegimeDriver] = Field(description="Key factors driving the current regime")
    summary: str = Field(description="Analyst-grade narrative summary")
    updated_at: datetime = Field(description="Timestamp of last regime computation")


class RegimeHistoryEntry(BaseModel):
    date: str = Field(description="Date of the regime observation (YYYY-MM-DD)")
    regime: str
    confidence: float = Field(ge=0.0, le=1.0)
    net_pressure: float
    summary: str


class RegimeHistoryResponse(BaseModel):
    entries: list[RegimeHistoryEntry]
    period_start: str
    period_end: str
