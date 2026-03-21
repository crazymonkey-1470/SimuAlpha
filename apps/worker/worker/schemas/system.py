"""Job run and system status domain models."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class JobType(str, Enum):
    SIMULATION = "simulation"
    REPLAY = "replay"
    CALIBRATION = "calibration"
    DATA_REFRESH = "data_refresh"


class JobRun(BaseModel):
    run_id: str = Field(description="Unique run identifier")
    job_type: JobType
    status: JobStatus = Field(default=JobStatus.PENDING)
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    summary: str | None = None
    warnings: list[str] = Field(default_factory=list)


class SimulationOutput(BaseModel):
    """Complete simulation payload — the full current-state output."""
    run_id: str
    timestamp: datetime
    regime: "RegimeSnapshot"  # forward ref resolved at runtime
    actors: list["ActorState"]
    scenarios: list["ScenarioBranch"]
    base_case_id: str
    signal: "SignalSummary"
    cross_asset: list["CrossAssetEntry"]
    cross_asset_as_of: str


# Resolve forward references after all schemas are importable.
def _resolve_refs() -> None:
    from worker.schemas.actor import ActorState  # noqa: F811
    from worker.schemas.context import CrossAssetEntry  # noqa: F811
    from worker.schemas.regime import RegimeSnapshot  # noqa: F811
    from worker.schemas.scenario import ScenarioBranch  # noqa: F811
    from worker.schemas.signal import SignalSummary  # noqa: F811
    SimulationOutput.model_rebuild()


_resolve_refs()
