from fastapi import APIRouter

from app.schemas.scenarios import ScenarioResponse
from app.services.scenarios import scenario_service

router = APIRouter()


@router.get("/current", response_model=ScenarioResponse)
async def get_current_scenarios() -> ScenarioResponse:
    return scenario_service.get_current()
