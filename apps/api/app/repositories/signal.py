"""Repository for SignalSummaryRecord persistence."""

from __future__ import annotations

import uuid

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.models import SignalSummaryRecord


class SignalRepository:
    def create(self, db: Session, *, run_id: uuid.UUID, data: dict) -> SignalSummaryRecord:
        record = SignalSummaryRecord(
            id=uuid.uuid4(),
            run_id=run_id,
            symbol=data.get("symbol", "SPY"),
            bias=data["bias"],
            confidence=data["confidence"],
            time_horizon=data["time_horizon"],
            suggested_posture=data["suggested_posture"],
            warnings=data.get("warnings"),
            change_vs_prior=data.get("change_vs_prior"),
            market_timestamp=data.get("market_timestamp"),
        )
        db.add(record)
        db.flush()
        return record

    def get_latest(self, db: Session, symbol: str = "SPY") -> SignalSummaryRecord | None:
        return (
            db.query(SignalSummaryRecord)
            .filter(SignalSummaryRecord.symbol == symbol)
            .order_by(desc(SignalSummaryRecord.created_at))
            .first()
        )

    def get_history(self, db: Session, symbol: str = "SPY", limit: int = 10) -> list[SignalSummaryRecord]:
        return (
            db.query(SignalSummaryRecord)
            .filter(SignalSummaryRecord.symbol == symbol)
            .order_by(desc(SignalSummaryRecord.created_at))
            .limit(limit)
            .all()
        )

    def get_by_run_id(self, db: Session, run_id: uuid.UUID) -> list[SignalSummaryRecord]:
        return db.query(SignalSummaryRecord).filter(SignalSummaryRecord.run_id == run_id).all()


signal_repo = SignalRepository()
