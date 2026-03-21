"""Regime analysis service — powered by the SimuAlpha simulation engine."""

from app.data.seed import REGIME_HISTORY
from app.schemas.regime import RegimeHistoryResponse, RegimeSnapshot
from app.services.engine_bridge import get_current_simulation


class RegimeService:
    def get_current(self) -> RegimeSnapshot:
        return get_current_simulation().regime

    def get_history(self, limit: int = 10) -> RegimeHistoryResponse:
        entries = REGIME_HISTORY[:limit]
        return RegimeHistoryResponse(
            entries=entries,
            period_start=entries[-1]["date"] if entries else "",
            period_end=entries[0]["date"] if entries else "",
        )


regime_service = RegimeService()
