from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.replay import ReplayFrame
from app.services.replay import replay_service

router = APIRouter()


@router.get("/{date}", response_model=ReplayFrame)
async def get_replay_frame(date: str, db: Session = Depends(get_db)) -> ReplayFrame:
    """Retrieve a historical replay snapshot for a given date (YYYY-MM-DD)."""
    return replay_service.get_frame(date, db=db)
