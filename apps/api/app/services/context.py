"""Cross-asset context service — powered by the SimuAlpha simulation engine."""

from app.schemas.context import CrossAssetResponse
from app.services.engine_bridge import get_current_simulation


class ContextService:
    def get_cross_asset(self) -> CrossAssetResponse:
        return get_current_simulation().cross_asset


context_service = ContextService()
