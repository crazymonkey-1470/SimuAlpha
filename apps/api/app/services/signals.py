"""Signal production service.

Currently returns seeded signal data. When the simulation engine is integrated,
signals will be derived from aggregated actor pressures, regime classification,
and scenario probabilities.
"""

from app.data.seed import CURRENT_SIGNAL, SIGNAL_HISTORY
from app.schemas.signals import SignalHistoryResponse, SignalSummary


class SignalService:
    def get_current(self) -> SignalSummary:
        return SignalSummary(**CURRENT_SIGNAL)

    def get_history(self, limit: int = 10) -> SignalHistoryResponse:
        entries = SIGNAL_HISTORY[:limit]
        return SignalHistoryResponse(
            entries=entries,
            period_start=entries[-1]["date"] if entries else "",
            period_end=entries[0]["date"] if entries else "",
        )


signal_service = SignalService()
