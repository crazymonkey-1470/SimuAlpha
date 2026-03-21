"""Regime analysis service — DB-first with engine fallback."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.data.seed import REGIME_HISTORY
from app.repositories.regime import regime_repo
from app.schemas.regime import (
    RegimeDriver,
    RegimeHistoryEntry,
    RegimeHistoryResponse,
    RegimeSnapshot,
)
from app.services.engine_bridge import get_current_simulation


class RegimeService:
    def get_current(self, db: Session | None = None) -> RegimeSnapshot:
        if db is not None:
            record = regime_repo.get_latest(db)
            if record:
                return RegimeSnapshot(
                    regime=record.regime,
                    confidence=record.confidence,
                    net_pressure=record.net_pressure,
                    posture=record.posture,
                    risk_flags=record.risk_flags or [],
                    drivers=[RegimeDriver(**d) for d in (record.drivers or [])],
                    summary=record.summary,
                    updated_at=record.created_at,
                )
        return get_current_simulation().regime

    def get_history(self, limit: int = 10, db: Session | None = None) -> RegimeHistoryResponse:
        if db is not None:
            records = regime_repo.get_history(db, limit=limit)
            if records:
                entries = [
                    RegimeHistoryEntry(
                        date=r.created_at.strftime("%Y-%m-%d"),
                        regime=r.regime,
                        confidence=r.confidence,
                        net_pressure=r.net_pressure,
                        summary=r.summary,
                    )
                    for r in records
                ]
                return RegimeHistoryResponse(
                    entries=entries,
                    period_start=entries[-1].date if entries else "",
                    period_end=entries[0].date if entries else "",
                )
        entries = REGIME_HISTORY[:limit]
        return RegimeHistoryResponse(
            entries=entries,
            period_start=entries[-1]["date"] if entries else "",
            period_end=entries[0]["date"] if entries else "",
        )


regime_service = RegimeService()
