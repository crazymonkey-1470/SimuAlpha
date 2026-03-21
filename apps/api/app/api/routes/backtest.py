"""Backtest API routes."""

from fastapi import APIRouter, Query

from app.services.backtest import backtest_service

router = APIRouter()


@router.get("/summary")
def get_backtest_summary(
    period: str | None = Query(None, description="Benchmark period name"),
    start: str | None = Query(None, description="Start date YYYY-MM-DD"),
    end: str | None = Query(None, description="End date YYYY-MM-DD"),
):
    """Run a backtest and return calibration summary."""
    return backtest_service.get_summary(period=period, start=start, end=end)
