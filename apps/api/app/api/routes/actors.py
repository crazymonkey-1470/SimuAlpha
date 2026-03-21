from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.actors import ActorStateResponse
from app.services.actors import actor_service

router = APIRouter()


@router.get("/current", response_model=ActorStateResponse)
async def get_current_actors(db: Session = Depends(get_db)) -> ActorStateResponse:
    return actor_service.get_current(db=db)
