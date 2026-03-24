"""Pydantic schemas for distress report API responses."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


class DistressReportResponse(BaseModel):
    id: str
    ticker: str
    company_name: str
    sector: str | None = None
    industry: str | None = None

    distress_rating: str = Field(description="Low / Moderate / High / Severe")
    distress_score: float = Field(description="0-100 composite distress score")
    executive_summary: str

    why_safe: list[str] = []
    key_risks: list[str] = []
    stabilizing_factors: list[str] = []
    what_to_watch: list[str] = []

    liquidity_analysis: str | None = None
    leverage_analysis: str | None = None
    profitability_analysis: str | None = None
    cashflow_analysis: str | None = None
    interest_coverage_analysis: str | None = None
    dilution_risk_analysis: str | None = None
    long_term_trend_analysis: str | None = None
    hold_context: str | None = None
    analyst_notes: str | None = None

    source_period_end: str | None = None
    raw_metrics: dict[str, Any] | None = None

    report_version: str = "v1"
    status: str = "completed"
    generated_at: datetime
    updated_at: datetime


class ReportSummary(BaseModel):
    """Lightweight report summary for lists."""
    id: str
    ticker: str
    company_name: str
    sector: str | None = None
    distress_rating: str
    distress_score: float
    executive_summary: str
    generated_at: datetime


class RecentReportsResponse(BaseModel):
    reports: list[ReportSummary]
    total: int


class AnalyzeRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=10, description="Stock ticker symbol")


class AnalyzeResponse(BaseModel):
    ticker: str
    status: str  # completed / not_found / error
    report: DistressReportResponse | None = None
    message: str | None = None


class MethodologyResponse(BaseModel):
    """Static methodology data for the frontend."""
    scoring_model: str
    factors: list[MethodologyFactor]
    disclaimers: list[str]
    version: str


class MethodologyFactor(BaseModel):
    name: str
    weight: str
    description: str
    thresholds: str
