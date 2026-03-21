"""Cross-asset context service.

Currently returns seeded cross-asset data. When market data integration is
built, this service will read from live or delayed market data feeds.
"""

from app.data.seed import CROSS_ASSET_CONTEXT
from app.schemas.context import CrossAssetResponse


class ContextService:
    def get_cross_asset(self) -> CrossAssetResponse:
        return CrossAssetResponse(**CROSS_ASSET_CONTEXT)


context_service = ContextService()
