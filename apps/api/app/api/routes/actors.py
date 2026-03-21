from fastapi import APIRouter

from app.schemas.actors import ActorStateResponse
from app.services.actors import actor_service

router = APIRouter()


@router.get("/current", response_model=ActorStateResponse)
async def get_current_actors() -> ActorStateResponse:
    return actor_service.get_current()
