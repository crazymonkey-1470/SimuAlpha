"""Signal production service — DB-first with engine fallback."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.data.seed import SIGNAL_HISTORY
from app.repositories.signal import signal_repo
from app.schemas.signals import (
    SignalHistoryEntry,
    SignalHistoryResponse,
    SignalSummary,
)
from app.services.engine_bridge import get_current_simulation


class SignalService:
    def get_current(self, db: Session | None = None) -> SignalSummary:
        if db is not None:
            record = signal_repo.get_latest(db)
            if record:
                return SignalSummary(
                    bias=record.bias,
                    confidence=record.confidence,
                    time_horizon=record.time_horizon,
                    suggested_posture=record.suggested_posture,
                    warnings=record.warnings or [],
                    change_vs_prior=record.change_vs_prior or "",
                    updated_at=record.created_at,
                )
        return get_current_simulation().signal

    def get_history(self, limit: int = 10, db: Session | None = None) -> SignalHistoryResponse:
        if db is not None:
            records = signal_repo.get_history(db, limit=limit)
            if records:
                entries = [
                    SignalHistoryEntry(
                        date=r.created_at.strftime("%Y-%m-%d"),
                        bias=r.bias,
                        confidence=r.confidence,
                        suggested_posture=r.suggested_posture,
                        summary=r.change_vs_prior or "",
                    )
                    for r in records
                ]
                return SignalHistoryResponse(
                    entries=entries,
                    period_start=entries[-1].date if entries else "",
                    period_end=entries[0].date if entries else "",
                )
        entries = SIGNAL_HISTORY[:limit]
        return SignalHistoryResponse(
            entries=entries,
            period_start=entries[-1]["date"] if entries else "",
            period_end=entries[0]["date"] if entries else "",
        )


signal_service = SignalService()
