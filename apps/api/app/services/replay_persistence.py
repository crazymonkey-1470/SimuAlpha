"""Service for persisting replay results to the database."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.db.models import ReplayFrameRecord, ReplayRun
from app.repositories.replay import replay_repo


class ReplayPersistenceService:
    def create_run(
        self,
        db: Session,
        *,
        symbol: str = "SPY",
        start_date: str,
        end_date: str,
    ) -> ReplayRun:
        return replay_repo.create_run(db, symbol=symbol, start_date=start_date, end_date=end_date)

    def persist_frame(
        self,
        db: Session,
        *,
        replay_run_id: uuid.UUID,
        frame_data: dict,
    ) -> ReplayFrameRecord:
        return replay_repo.create_frame(db, replay_run_id=replay_run_id, data=frame_data)

    def mark_completed(self, db: Session, run_id: uuid.UUID, summary: str, frame_count: int) -> None:
        replay_repo.mark_run_completed(db, run_id, summary, frame_count)

    def mark_failed(self, db: Session, run_id: uuid.UUID, error: str) -> None:
        replay_repo.mark_run_failed(db, run_id, error)


replay_persistence = ReplayPersistenceService()
