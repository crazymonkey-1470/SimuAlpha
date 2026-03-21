"""Regime domain models aligned with API contracts."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class RegimeDriver(BaseModel):
    factor: str = Field(description="Name of the driving factor")
    influence: float = Field(description="Influence weight, -1.0 to 1.0")
    description: str = Field(description="Human-readable explanation")


class RegimeSnapshot(BaseModel):
    regime: str = Field(description="Regime classification label")
    confidence: float = Field(ge=0.0, le=1.0, description="Model confidence")
    net_pressure: float = Field(description="Aggregate directional pressure, -1.0 to 1.0")
    posture: str = Field(description="Recommended portfolio posture")
    risk_flags: list[str] = Field(description="Active risk warnings")
    drivers: list[RegimeDriver] = Field(description="Key factors driving regime")
    summary: str = Field(description="Analyst-grade narrative summary")
    updated_at: datetime = Field(description="Timestamp of computation")


class RegimeHistoryEntry(BaseModel):
    date: str = Field(description="YYYY-MM-DD")
    regime: str
    confidence: float = Field(ge=0.0, le=1.0)
    net_pressure: float
    summary: str
