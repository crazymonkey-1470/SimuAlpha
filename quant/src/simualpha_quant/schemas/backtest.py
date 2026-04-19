"""Schemas for the backtest_pattern tool."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from simualpha_quant.schemas.charts import DateRange
from simualpha_quant.schemas.universe import UniverseSpec

DEFAULT_HORIZONS_MONTHS: tuple[int, ...] = (3, 6, 12, 24)


# ─────────────────────────── statistics ─────────────────────────────────────


class HorizonStats(BaseModel):
    horizon_months: int = Field(..., gt=0)
    sample_size: int = Field(..., ge=0)
    hit_rate: float = Field(..., ge=0.0, le=1.0)        # fraction with positive return
    median_return: float
    p25_return: float
    p75_return: float
    avg_max_drawdown: float                              # avg max DD within hold


class YearlyHorizonStats(BaseModel):
    year: int
    sample_size: int
    hit_rate: float
    median_return: float


class YearlyBreakdown(BaseModel):
    horizon_months: int
    by_year: list[YearlyHorizonStats]


class SampleSignal(BaseModel):
    ticker: str
    signal_date: date
    forward_returns: dict[int, float]                    # horizon_months → return


# ─────────────────────────── request / response ─────────────────────────────


class BacktestPatternRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pattern_name: str | None = Field(
        default=None,
        description=(
            "Name of a pre-built pattern from the library "
            "(wave_2_at_618, wave_4_at_382, confluence_zone, "
            "generational_support, impossible_level)."
        ),
    )
    custom_expression: dict[str, Any] | None = Field(
        default=None,
        description=(
            "Custom pattern expression in the JSON DSL. See "
            "docs/custom-expression-dsl.md."
        ),
    )
    universe_spec: UniverseSpec
    date_range: DateRange
    horizons: list[int] = Field(default=list(DEFAULT_HORIZONS_MONTHS))
    params: dict[str, Any] | None = None
    include_per_year: bool = True
    sample_size: int = Field(default=10, ge=0, le=100)

    @field_validator("horizons")
    @classmethod
    def _horizons_positive(cls, v: list[int]) -> list[int]:
        if not v:
            raise ValueError("horizons must contain at least one positive integer")
        for h in v:
            if h <= 0:
                raise ValueError(f"horizon must be positive: {h}")
        return sorted(set(v))

    @model_validator(mode="after")
    def _xor(self):
        if (self.pattern_name is None) == (self.custom_expression is None):
            raise ValueError(
                "exactly one of `pattern_name` or `custom_expression` must be provided"
            )
        return self


class BacktestPatternResponse(BaseModel):
    pattern_name: str | None = None
    universe_resolved: int                               # ticker count after resolution
    signal_count: int
    stats: list[HorizonStats]                            # one entry per requested horizon
    per_year_breakdown: list[YearlyBreakdown] | None = None
    sample_signals: list[SampleSignal] = Field(default_factory=list)
    cached: bool = False
    hash: str
    job_id: str | None = None                            # set when async path was taken
    computed_at: datetime


# ─────────────────────────── async job tracking ─────────────────────────────


JobStatusName = Literal["queued", "running", "done", "error"]


class JobStatus(BaseModel):
    job_id: str
    status: JobStatusName
    submitted_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    request_payload: dict[str, Any]
    result: BacktestPatternResponse | None = None
    error: str | None = None
