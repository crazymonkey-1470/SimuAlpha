"""Fundamentals tool schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Canonical TLI-scoring metric names — match FUNDAMENTAL_METRICS in
# data/openbb_ingest.py.
TLI_METRICS: tuple[str, ...] = (
    "revenue",
    "ebitda",
    "free_cash_flow",
    "shares_outstanding",
    "total_debt",
    "cash",
    "gross_margin",
    "operating_margin",
    "net_income",
)


class FundamentalsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str = Field(..., min_length=1, max_length=12)
    metrics: list[str] | None = Field(
        default=None,
        description="Subset of TLI metrics. Omit to receive all known metrics.",
    )

    @field_validator("ticker")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("metrics")
    @classmethod
    def _validate_metrics(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        cleaned = [m.strip().lower() for m in v if m and m.strip()]
        unknown = [m for m in cleaned if m not in TLI_METRICS]
        if unknown:
            raise ValueError(
                f"unknown metric(s): {unknown}; allowed: {list(TLI_METRICS)}"
            )
        return cleaned or None


class FundamentalRecord(BaseModel):
    period_end: date
    metric_name: str
    metric_value: float | None = None
    source: str | None = None
    ingested_at: datetime | None = None


Source = Literal["cache", "cache+backfill", "openbb"]


class Fundamentals(BaseModel):
    ticker: str
    records: list[FundamentalRecord]
    source: Source
    latest_period_end: date | None = None
