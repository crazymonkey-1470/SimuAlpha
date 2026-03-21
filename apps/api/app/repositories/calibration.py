"""Repository for CalibrationRun persistence."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.models import CalibrationRun


class CalibrationRepository:
    def create(
        self,
        db: Session,
        *,
        symbol: str = "SPY",
        period_name: str | None = None,
        start_date: str,
        end_date: str,
    ) -> CalibrationRun:
        run = CalibrationRun(
            id=uuid.uuid4(),
            symbol=symbol,
            period_name=period_name,
            start_date=start_date,
            end_date=end_date,
            status="pending",
        )
        db.add(run)
        db.flush()
        return run

    def mark_completed(self, db: Session, run_id: uuid.UUID, summary: str, metrics: dict) -> None:
        run = db.get(CalibrationRun, run_id)
        if run:
            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            run.summary = summary
            run.metrics = metrics
            db.flush()

    def mark_failed(self, db: Session, run_id: uuid.UUID, error: str) -> None:
        run = db.get(CalibrationRun, run_id)
        if run:
            run.status = "failed"
            run.completed_at = datetime.now(timezone.utc)
            run.summary = error
            db.flush()

    def get_by_id(self, db: Session, run_id: uuid.UUID) -> CalibrationRun | None:
        return db.query(CalibrationRun).filter(CalibrationRun.id == run_id).first()

    def get_latest(self, db: Session, symbol: str = "SPY") -> CalibrationRun | None:
        return (
            db.query(CalibrationRun)
            .filter(CalibrationRun.symbol == symbol, CalibrationRun.status == "completed")
            .order_by(desc(CalibrationRun.completed_at))
            .first()
        )

    def list_recent(self, db: Session, limit: int = 20) -> list[CalibrationRun]:
        return db.query(CalibrationRun).order_by(desc(CalibrationRun.created_at)).limit(limit).all()


calibration_repo = CalibrationRepository()
