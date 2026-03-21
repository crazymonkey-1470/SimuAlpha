from fastapi import APIRouter

from app.schemas.replay import ReplayFrame
from app.services.replay import replay_service

router = APIRouter()


@router.get("/{date}", response_model=ReplayFrame)
async def get_replay_frame(date: str) -> ReplayFrame:
    """Retrieve a historical replay snapshot for a given date (YYYY-MM-DD)."""
    return replay_service.get_frame(date)
