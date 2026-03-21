from fastapi import APIRouter, Query

from app.schemas.signals import SignalHistoryResponse, SignalSummary
from app.services.signals import signal_service

router = APIRouter()


@router.get("/current", response_model=SignalSummary)
async def get_current_signal() -> SignalSummary:
    return signal_service.get_current()


@router.get("/history", response_model=SignalHistoryResponse)
async def get_signal_history(
    limit: int = Query(default=10, ge=1, le=100, description="Number of entries to return"),
) -> SignalHistoryResponse:
    return signal_service.get_history(limit=limit)
