from fastapi import APIRouter

from app.schemas.system import SystemStatus
from app.services.system import system_service

router = APIRouter()


@router.get("/status", response_model=SystemStatus)
async def system_status() -> SystemStatus:
    return system_service.get_status()
