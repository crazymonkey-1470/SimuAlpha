from datetime import datetime

from pydantic import BaseModel, Field


class SignalSummary(BaseModel):
    bias: str = Field(description="Net signal direction: bullish, bearish, neutral")
    confidence: float = Field(ge=0.0, le=1.0, description="Signal confidence level")
    time_horizon: str = Field(description="Applicable time horizon for this signal")
    suggested_posture: str = Field(description="Recommended positioning posture")
    warnings: list[str] = Field(description="Active signal-level warnings")
    change_vs_prior: str = Field(
        description="Description of how this signal differs from the prior period"
    )
    updated_at: datetime = Field(description="Timestamp of last signal computation")


class SignalHistoryEntry(BaseModel):
    date: str = Field(description="Date of signal observation (YYYY-MM-DD)")
    bias: str
    confidence: float = Field(ge=0.0, le=1.0)
    suggested_posture: str
    summary: str


class SignalHistoryResponse(BaseModel):
    entries: list[SignalHistoryEntry]
    period_start: str
    period_end: str
