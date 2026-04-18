"""Pydantic v2 schemas — single source of truth for tool I/O."""

from simualpha_quant.schemas.charts import (
    AnnotationsSpec,
    Badge,
    ChartConfig,
    DateRange,
    EntryTranche,
    FibLevel,
    HorizontalLine,
    MovingAverageSpec,
    RenderChartRequest,
    RenderChartResponse,
    WaveLabel,
    Zone,
)
from simualpha_quant.schemas.common import ErrorResponse, Meta, SuccessResponse
from simualpha_quant.schemas.fundamentals import (
    FundamentalRecord,
    Fundamentals,
    FundamentalsRequest,
)
from simualpha_quant.schemas.prices import PriceBar, PriceHistory, PriceHistoryRequest

__all__ = [
    "AnnotationsSpec",
    "Badge",
    "ChartConfig",
    "DateRange",
    "EntryTranche",
    "ErrorResponse",
    "FibLevel",
    "FundamentalRecord",
    "Fundamentals",
    "FundamentalsRequest",
    "HorizontalLine",
    "Meta",
    "MovingAverageSpec",
    "PriceBar",
    "PriceHistory",
    "PriceHistoryRequest",
    "RenderChartRequest",
    "RenderChartResponse",
    "SuccessResponse",
    "WaveLabel",
    "Zone",
]
