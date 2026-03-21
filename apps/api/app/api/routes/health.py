from fastapi import APIRouter

from app.schemas.system import HealthResponse
from app.services.system import system_service

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return system_service.get_health()
