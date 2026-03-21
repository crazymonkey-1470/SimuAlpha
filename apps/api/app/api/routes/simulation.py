from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.simulation import SimulationRequest, SimulationRunResponse
from app.services.simulation import simulation_service

router = APIRouter()


@router.post("/run", response_model=SimulationRunResponse)
async def submit_simulation_run(
    request: SimulationRequest,
    db: Session = Depends(get_db),
) -> SimulationRunResponse:
    """Submit and execute a simulation run."""
    return simulation_service.submit_run(request, db=db)
