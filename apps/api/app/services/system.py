"""System health and status service."""

from app.core.config import settings
from app.data.seed import SYSTEM_STATUS
from app.schemas.system import HealthResponse, SystemStatus


class SystemService:
    def get_health(self) -> HealthResponse:
        return HealthResponse(
            status="healthy",
            service=settings.app_name,
            version=settings.version,
        )

    def get_status(self) -> SystemStatus:
        return SystemStatus(**SYSTEM_STATUS)


system_service = SystemService()
