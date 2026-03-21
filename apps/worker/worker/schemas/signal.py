"""Signal summary domain models aligned with API contracts."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SignalSummary(BaseModel):
    bias: str = Field(description="Net signal direction")
    confidence: float = Field(ge=0.0, le=1.0, description="Signal confidence")
    time_horizon: str = Field(description="Applicable time horizon")
    suggested_posture: str = Field(description="Recommended positioning posture")
    warnings: list[str] = Field(description="Active signal-level warnings")
    change_vs_prior: str = Field(description="Difference from prior period")
    updated_at: datetime = Field(description="Timestamp of computation")


class SignalHistoryEntry(BaseModel):
    date: str = Field(description="YYYY-MM-DD")
    bias: str
    confidence: float = Field(ge=0.0, le=1.0)
    suggested_posture: str
    summary: str
