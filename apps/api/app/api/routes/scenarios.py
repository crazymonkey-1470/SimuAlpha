from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.scenarios import ScenarioResponse
from app.services.scenarios import scenario_service

router = APIRouter()


@router.get("/current", response_model=ScenarioResponse)
async def get_current_scenarios(db: Session = Depends(get_db)) -> ScenarioResponse:
    return scenario_service.get_current(db=db)
