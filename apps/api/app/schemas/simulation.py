from datetime import datetime

from pydantic import BaseModel, Field


class SimulationRequest(BaseModel):
    scenario_id: str | None = Field(
        default=None, description="Optional scenario branch to simulate against"
    )
    horizon_days: int = Field(
        default=5, ge=1, le=90, description="Simulation forward horizon in trading days"
    )
    num_paths: int = Field(
        default=1000, ge=100, le=50000, description="Number of Monte Carlo paths"
    )
    notes: str | None = Field(default=None, description="Optional notes for this run")


class SimulationRunResponse(BaseModel):
    run_id: str = Field(description="Unique identifier for this simulation run")
    status: str = Field(description="Job status: queued, running, completed, failed")
    submitted_at: datetime = Field(description="Timestamp of job submission")
    message: str = Field(description="Human-readable status message")
