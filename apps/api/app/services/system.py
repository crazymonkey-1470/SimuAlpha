"""System health and status service — reads from DB when available."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import SystemStatusRecord
from app.schemas.system import HealthResponse, SystemStatus


class SystemService:
    def get_health(self) -> HealthResponse:
        return HealthResponse(
            status="healthy",
            service=settings.app_name,
            version=settings.version,
        )

    def get_status(self, db: Session | None = None) -> SystemStatus:
        if db is not None:
            record = db.get(SystemStatusRecord, 1)
            if record:
                return SystemStatus(
                    api_status="operational",
                    data_freshness=(
                        f"last refresh {record.last_data_refresh.strftime('%Y-%m-%d %H:%M UTC')}"
                        if record.last_data_refresh
                        else "no data refresh recorded"
                    ),
                    last_simulation_run=record.last_successful_simulation,
                    calibration_status=(
                        f"last calibration {record.last_successful_calibration.strftime('%Y-%m-%d %H:%M UTC')}"
                        if record.last_successful_calibration
                        else "not calibrated"
                    ),
                    worker_status=record.worker_status or "unknown",
                    active_model_version=settings.version,
                    warnings=record.warnings or [],
                )
        # Fallback to seed data
        from app.data.seed import SYSTEM_STATUS

        return SystemStatus(**SYSTEM_STATUS)


system_service = SystemService()
