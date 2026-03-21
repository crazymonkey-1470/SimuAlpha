"""Schemas for run/job tracking endpoints."""

from datetime import datetime

from pydantic import BaseModel, Field


class RunSummary(BaseModel):
    id: str
    run_type: str
    symbol: str
    status: str
    source: str
    summary: str | None = None
    warnings: list[str] = Field(default_factory=list)
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None


class RunListResponse(BaseModel):
    runs: list[RunSummary]
    total: int


class ReplayRunSummary(BaseModel):
    id: str
    symbol: str
    start_date: str
    end_date: str
    status: str
    summary: str | None = None
    frame_count: int | None = None
    created_at: datetime
    completed_at: datetime | None = None


class ReplayRunListResponse(BaseModel):
    runs: list[ReplayRunSummary]
    total: int


class CalibrationRunSummary(BaseModel):
    id: str
    symbol: str
    period_name: str | None = None
    start_date: str
    end_date: str
    status: str
    summary: str | None = None
    metrics: dict | None = None
    created_at: datetime
    completed_at: datetime | None = None


class CalibrationRunListResponse(BaseModel):
    runs: list[CalibrationRunSummary]
    total: int


class ReplayRunRequest(BaseModel):
    start_date: str = Field(description="Start date YYYY-MM-DD")
    end_date: str = Field(description="End date YYYY-MM-DD")
    symbol: str = Field(default="SPY")


class CalibrationRunRequest(BaseModel):
    period_name: str | None = Field(default=None, description="Benchmark period name")
    start_date: str = Field(default="2020-01-01")
    end_date: str = Field(default="2020-12-31")
    symbol: str = Field(default="SPY")
