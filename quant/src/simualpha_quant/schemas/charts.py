"""Schemas for the render_tli_chart tool.

OpenClaw composes the annotations spec; the tool renders them faithfully.
The tool does NOT decide what to annotate.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ──────────────────────────── annotation parts ────────────────────────────


class FibLevel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    level: float = Field(..., ge=0.0, le=4.0, description="Fib ratio, e.g. 0.618 or 1.618")
    price: float
    label: str | None = None
    style: Literal["solid", "dashed", "dotted"] = "dashed"
    color: str | None = None


class WaveLabel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    wave_id: str = Field(..., min_length=1, max_length=4, description="e.g. '1', '2', 'A', 'B'")
    wave_type: Literal["impulse", "corrective"]
    price: float
    date: date
    label: str | None = None


class HorizontalLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    price: float
    kind: Literal["support", "resistance", "bullish_flip", "bearish_flip"]
    label: str | None = None


class MovingAverageSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: int = Field(..., gt=0, le=2000)
    type: Literal["SMA", "EMA"] = "SMA"
    color: str | None = None


class Zone(BaseModel):
    model_config = ConfigDict(extra="forbid")
    low: float
    high: float
    label: str
    color: str | None = None
    opacity: float = Field(default=0.25, ge=0.0, le=1.0)


class EntryTranche(BaseModel):
    model_config = ConfigDict(extra="forbid")
    price: float
    pct: float = Field(..., gt=0.0, le=1.0, description="Fraction of total position (0 < pct <= 1)")
    label: str


class Badge(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str
    placement: Literal["top", "bottom", "near_zone"] = "top"
    color: str | None = None
    style: Literal["pill", "flag", "banner"] = "pill"


# ──────────────────────────── grouping objects ────────────────────────────


class AnnotationsSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fibonacci_levels: list[FibLevel] = Field(default_factory=list)
    wave_labels: list[WaveLabel] = Field(default_factory=list)
    horizontal_lines: list[HorizontalLine] = Field(default_factory=list)
    moving_averages: list[MovingAverageSpec] = Field(default_factory=list)
    zones: list[Zone] = Field(default_factory=list)
    entry_tranches: list[EntryTranche] = Field(default_factory=list)
    badges: list[Badge] = Field(default_factory=list)
    caption: str | None = None


class DateRange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: date
    end: date

    @field_validator("end")
    @classmethod
    def _ordered(cls, v: date, info):  # noqa: ARG002
        return v


class ChartConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    width: int = Field(default=1200, ge=400, le=4000)
    height: int = Field(default=700, ge=300, le=4000)
    theme: Literal["light", "dark"] = "dark"
    watermark: str | None = "SimuAlpha"
    show_volume: bool = True


# ──────────────────────────── request / response ────────────────────────────


class RenderChartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str = Field(..., min_length=1, max_length=12)
    timeframe: Literal["daily", "weekly", "monthly"] = "daily"
    date_range: DateRange
    annotations: AnnotationsSpec = Field(default_factory=AnnotationsSpec)
    config: ChartConfig = Field(default_factory=ChartConfig)

    @field_validator("ticker")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()


class RenderChartResponse(BaseModel):
    url: str
    cached: bool
    hash: str
    width: int
    height: int
    generated_at: datetime
