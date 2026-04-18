"""Request / response schemas for the simulate_strategy tool."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from simualpha_quant.schemas.strategy import StrategySpec

# ─────────────────────────── request ────────────────────────────────


class SimulateStrategyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    strategy: StrategySpec
    chart_samples: int = Field(
        default=5,
        ge=0,
        le=20,
        description=(
            "How many representative trades to render charts for. "
            "0 ≤ chart_samples ≤ 5: rendered synchronously inline. "
            "6 ≤ chart_samples ≤ 20: rendered asynchronously — response "
            "includes charts_job_id and each trade_log_sample entry "
            "carries chart_status='pending' until the charts job "
            "completes. Poll GET /v1/jobs/{charts_job_id}."
        ),
    )


SYNC_CHART_LIMIT: int = 5


# ─────────────────────────── outputs ────────────────────────────────


class SimulationSummary(BaseModel):
    total_trades: int
    win_rate: float
    avg_win_pct: float
    avg_loss_pct: float
    profit_factor: float
    sharpe: float
    sortino: float
    max_drawdown_pct: float
    calmar: float


class HorizonOutcome(BaseModel):
    horizon_months: int
    reached_target_pct: float


class EquityOHLC(BaseModel):
    """Downsampled equity-curve bucket, OHLC-style."""
    date: date
    open: float
    high: float
    low: float
    close: float


ChartStatus = Literal["rendered", "pending", "skipped", "failed"]


class TradeChart(BaseModel):
    ticker: str
    entry_date: date
    exit_date: date | None
    entry_price: float
    exit_price: float | None
    outcome_pct: float
    chart_url: str | None = None
    chart_status: ChartStatus = "pending"


class SimulateStrategyResponse(BaseModel):
    summary_stats: SimulationSummary
    per_horizon_outcomes: list[HorizonOutcome]
    # Plain close-only curve, uniform bucket, last-value-in-bucket.
    equity_curve: list[float]
    equity_curve_dates: list[date]
    # OHLC-style bucketed curve (open/high/low/close per bucket).
    equity_curve_ohlc: list[EquityOHLC]
    trade_log_sample: list[TradeChart]
    charts_job_id: str | None = None
    cached: bool = False
    hash: str
    job_id: str | None = None
    computed_at: datetime
