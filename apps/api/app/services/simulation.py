"""Simulation job submission service.

Currently returns a mock job acknowledgment. When the worker service and
task queue are integrated, this service will submit simulation jobs to the
queue and return real job tracking IDs.

Integration points:
- Submit job to worker queue (Redis, SQS, or similar)
- Store job metadata in a persistent store
- Return job ID for status polling
"""

import uuid
from datetime import datetime, timezone

from app.schemas.simulation import SimulationRequest, SimulationRunResponse


class SimulationService:
    def submit_run(self, request: SimulationRequest) -> SimulationRunResponse:
        # Future: dispatch to worker queue
        # e.g. job_id = queue.submit(SimulationJob(request))
        run_id = f"sim-{uuid.uuid4().hex[:12]}"
        return SimulationRunResponse(
            run_id=run_id,
            status="queued",
            submitted_at=datetime.now(timezone.utc),
            message=(
                f"Simulation run {run_id} queued with {request.num_paths} paths "
                f"over {request.horizon_days}-day horizon. "
                "Worker integration pending — this is a mock acknowledgment."
            ),
        )


simulation_service = SimulationService()
