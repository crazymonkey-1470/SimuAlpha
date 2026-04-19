"""Pydantic v2 schemas — single source of truth for tool I/O."""

from simualpha_quant.schemas.backtest import (
    BacktestPatternRequest,
    BacktestPatternResponse,
    HorizonStats,
    JobStatus,
    SampleSignal,
    YearlyBreakdown,
    YearlyHorizonStats,
)
from simualpha_quant.schemas.simulate import (
    EquityOHLC,
    HorizonOutcome,
    SimulateStrategyRequest,
    SimulateStrategyResponse,
    SimulationSummary,
    TradeChart,
)
from simualpha_quant.schemas.strategy import (
    EntryRules,
    ExitLeg,
    ExitRules,
    PositionSizing,
    PriceRule,
    StopLoss,
    StrategySpec,
    Tranche,
)
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
from simualpha_quant.schemas.universe import UniverseSpec

__all__ = [
    "AnnotationsSpec",
    "BacktestPatternRequest",
    "BacktestPatternResponse",
    "Badge",
    "ChartConfig",
    "DateRange",
    "EntryTranche",
    "ErrorResponse",
    "FibLevel",
    "FundamentalRecord",
    "Fundamentals",
    "FundamentalsRequest",
    "HorizonStats",
    "HorizontalLine",
    "JobStatus",
    "Meta",
    "MovingAverageSpec",
    "PriceBar",
    "PriceHistory",
    "PriceHistoryRequest",
    "RenderChartRequest",
    "RenderChartResponse",
    "SampleSignal",
    "SuccessResponse",
    "UniverseSpec",
    "WaveLabel",
    "YearlyBreakdown",
    "YearlyHorizonStats",
    "Zone",
]
