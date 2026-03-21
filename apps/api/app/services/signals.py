"""Signal production service — powered by the SimuAlpha simulation engine."""

from app.data.seed import SIGNAL_HISTORY
from app.schemas.signals import SignalHistoryResponse, SignalSummary
from app.services.engine_bridge import get_current_simulation


class SignalService:
    def get_current(self) -> SignalSummary:
        return get_current_simulation().signal

    def get_history(self, limit: int = 10) -> SignalHistoryResponse:
        entries = SIGNAL_HISTORY[:limit]
        return SignalHistoryResponse(
            entries=entries,
            period_start=entries[-1]["date"] if entries else "",
            period_end=entries[0]["date"] if entries else "",
        )


signal_service = SignalService()
