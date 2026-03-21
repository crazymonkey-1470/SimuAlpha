"""Service for persisting calibration/backtest results to the database."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.db.models import CalibrationRun, SystemStatusRecord
from app.repositories.calibration import calibration_repo
from datetime import datetime, timezone


class CalibrationPersistenceService:
    def create_run(
        self,
        db: Session,
        *,
        symbol: str = "SPY",
        period_name: str | None = None,
        start_date: str,
        end_date: str,
    ) -> CalibrationRun:
        return calibration_repo.create(
            db, symbol=symbol, period_name=period_name, start_date=start_date, end_date=end_date
        )

    def mark_completed(
        self, db: Session, run_id: uuid.UUID, summary: str, metrics: dict
    ) -> None:
        calibration_repo.mark_completed(db, run_id, summary, metrics)
        # Update system status
        status = db.get(SystemStatusRecord, 1)
        if not status:
            status = SystemStatusRecord(id=1)
            db.add(status)
        status.last_successful_calibration = datetime.now(timezone.utc)
        status.updated_at = datetime.now(timezone.utc)
        db.flush()

    def mark_failed(self, db: Session, run_id: uuid.UUID, error: str) -> None:
        calibration_repo.mark_failed(db, run_id, error)


calibration_persistence = CalibrationPersistenceService()
