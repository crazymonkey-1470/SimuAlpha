"""Price-history tool schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PriceHistoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str = Field(..., min_length=1, max_length=12, description="Equity symbol, upper-cased")
    start: date = Field(..., description="Inclusive start date (YYYY-MM-DD)")
    end: date = Field(..., description="Inclusive end date (YYYY-MM-DD)")
    timeframe: Literal["daily"] = "daily"

    @field_validator("ticker")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()


class PriceBar(BaseModel):
    date: date
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    adj_close: float | None = None
    volume: int | None = None


Source = Literal["cache", "cache+backfill", "openbb"]


class PriceHistory(BaseModel):
    ticker: str
    timeframe: Literal["daily"] = "daily"
    start: date
    end: date
    bars: list[PriceBar]
    source: Source
    cached_ingested_at: datetime | None = None
