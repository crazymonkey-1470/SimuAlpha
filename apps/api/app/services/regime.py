"""Regime analysis service.

Currently returns seeded data. When the simulation engine is integrated,
this service will read computed regime state from the data store or
simulation output pipeline.
"""

from app.data.seed import CURRENT_REGIME, REGIME_HISTORY
from app.schemas.regime import RegimeHistoryResponse, RegimeSnapshot


class RegimeService:
    def get_current(self) -> RegimeSnapshot:
        return RegimeSnapshot(**CURRENT_REGIME)

    def get_history(self, limit: int = 10) -> RegimeHistoryResponse:
        entries = REGIME_HISTORY[:limit]
        return RegimeHistoryResponse(
            entries=entries,
            period_start=entries[-1]["date"] if entries else "",
            period_end=entries[0]["date"] if entries else "",
        )


regime_service = RegimeService()
