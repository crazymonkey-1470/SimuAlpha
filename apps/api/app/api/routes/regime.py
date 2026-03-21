from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.regime import RegimeHistoryResponse, RegimeSnapshot
from app.services.regime import regime_service

router = APIRouter()


@router.get("/current", response_model=RegimeSnapshot)
async def get_current_regime(db: Session = Depends(get_db)) -> RegimeSnapshot:
    return regime_service.get_current(db=db)


@router.get("/history", response_model=RegimeHistoryResponse)
async def get_regime_history(
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
) -> RegimeHistoryResponse:
    return regime_service.get_history(limit=limit, db=db)
