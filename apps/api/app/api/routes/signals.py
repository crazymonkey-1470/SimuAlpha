from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.signals import SignalHistoryResponse, SignalSummary
from app.services.signals import signal_service

router = APIRouter()


@router.get("/current", response_model=SignalSummary)
async def get_current_signal(db: Session = Depends(get_db)) -> SignalSummary:
    return signal_service.get_current(db=db)


@router.get("/history", response_model=SignalHistoryResponse)
async def get_signal_history(
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
) -> SignalHistoryResponse:
    return signal_service.get_history(limit=limit, db=db)
