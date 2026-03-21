from fastapi import APIRouter, Query

from app.schemas.regime import RegimeHistoryResponse, RegimeSnapshot
from app.services.regime import regime_service

router = APIRouter()


@router.get("/current", response_model=RegimeSnapshot)
async def get_current_regime() -> RegimeSnapshot:
    return regime_service.get_current()


@router.get("/history", response_model=RegimeHistoryResponse)
async def get_regime_history(
    limit: int = Query(default=10, ge=1, le=100, description="Number of entries to return"),
) -> RegimeHistoryResponse:
    return regime_service.get_history(limit=limit)
