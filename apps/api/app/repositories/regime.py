"""Repository for RegimeSnapshotRecord persistence."""

from __future__ import annotations

import uuid

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.models import RegimeSnapshotRecord


class RegimeRepository:
    def create(self, db: Session, *, run_id: uuid.UUID, data: dict) -> RegimeSnapshotRecord:
        record = RegimeSnapshotRecord(
            id=uuid.uuid4(),
            run_id=run_id,
            symbol=data.get("symbol", "SPY"),
            regime=data["regime"],
            confidence=data["confidence"],
            net_pressure=data["net_pressure"],
            posture=data["posture"],
            summary=data["summary"],
            drivers=data.get("drivers"),
            risk_flags=data.get("risk_flags"),
            market_timestamp=data.get("market_timestamp"),
        )
        db.add(record)
        db.flush()
        return record

    def get_latest(self, db: Session, symbol: str = "SPY") -> RegimeSnapshotRecord | None:
        return (
            db.query(RegimeSnapshotRecord)
            .filter(RegimeSnapshotRecord.symbol == symbol)
            .order_by(desc(RegimeSnapshotRecord.created_at))
            .first()
        )

    def get_history(self, db: Session, symbol: str = "SPY", limit: int = 10) -> list[RegimeSnapshotRecord]:
        return (
            db.query(RegimeSnapshotRecord)
            .filter(RegimeSnapshotRecord.symbol == symbol)
            .order_by(desc(RegimeSnapshotRecord.created_at))
            .limit(limit)
            .all()
        )

    def get_by_run_id(self, db: Session, run_id: uuid.UUID) -> list[RegimeSnapshotRecord]:
        return db.query(RegimeSnapshotRecord).filter(RegimeSnapshotRecord.run_id == run_id).all()


regime_repo = RegimeRepository()
