from fastapi import APIRouter

from app.schemas.simulation import SimulationRequest, SimulationRunResponse
from app.services.simulation import simulation_service

router = APIRouter()


@router.post("/run", response_model=SimulationRunResponse)
async def submit_simulation_run(request: SimulationRequest) -> SimulationRunResponse:
    """Submit a simulation run request.

    Currently returns a mock acknowledgment. When the worker service is
    integrated, this will dispatch to the job queue and return a trackable
    run ID.
    """
    return simulation_service.submit_run(request)
