from datetime import datetime

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str


class SystemStatus(BaseModel):
    api_status: str = Field(description="API service health")
    data_freshness: str = Field(description="Age of the most recent market data ingestion")
    last_simulation_run: datetime | None = Field(
        description="Timestamp of the last completed simulation run"
    )
    calibration_status: str = Field(description="Model calibration state")
    worker_status: str = Field(description="Background worker service status")
    active_model_version: str = Field(description="Currently deployed simulation model version")
    warnings: list[str] = Field(description="System-level warnings and advisories")
