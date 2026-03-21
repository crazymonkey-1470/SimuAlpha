"""Repository for ReplayRun and ReplayFrameRecord persistence."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.db.models import ReplayFrameRecord, ReplayRun


class ReplayRepository:
    # ── ReplayRun ──────────────────────────────────────────────────────

    def create_run(
        self,
        db: Session,
        *,
        symbol: str = "SPY",
        start_date: str,
        end_date: str,
    ) -> ReplayRun:
        run = ReplayRun(
            id=uuid.uuid4(),
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
            status="pending",
        )
        db.add(run)
        db.flush()
        return run

    def mark_run_completed(self, db: Session, run_id: uuid.UUID, summary: str, frame_count: int) -> None:
        run = db.get(ReplayRun, run_id)
        if run:
            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            run.summary = summary
            run.frame_count = frame_count
            db.flush()

    def mark_run_failed(self, db: Session, run_id: uuid.UUID, error: str) -> None:
        run = db.get(ReplayRun, run_id)
        if run:
            run.status = "failed"
            run.completed_at = datetime.now(timezone.utc)
            run.summary = error
            db.flush()

    def get_run_by_id(self, db: Session, run_id: uuid.UUID) -> ReplayRun | None:
        return (
            db.query(ReplayRun)
            .options(joinedload(ReplayRun.frames))
            .filter(ReplayRun.id == run_id)
            .first()
        )

    def list_runs(self, db: Session, limit: int = 20) -> list[ReplayRun]:
        return db.query(ReplayRun).order_by(desc(ReplayRun.created_at)).limit(limit).all()

    # ── ReplayFrame ────────────────────────────────────────────────────

    def create_frame(self, db: Session, *, replay_run_id: uuid.UUID, data: dict) -> ReplayFrameRecord:
        record = ReplayFrameRecord(
            id=uuid.uuid4(),
            replay_run_id=replay_run_id,
            symbol=data.get("symbol", "SPY"),
            frame_date=data["date"],
            regime=data["regime"],
            regime_confidence=data["regime_confidence"],
            net_pressure=data["net_pressure"],
            signal_bias=data.get("signal_bias"),
            realized_outcome=data.get("realized_outcome"),
            notes=data.get("notes"),
            snapshot_payload=data.get("snapshot_payload"),
        )
        db.add(record)
        db.flush()
        return record

    def get_frames_by_run(self, db: Session, replay_run_id: uuid.UUID) -> list[ReplayFrameRecord]:
        return (
            db.query(ReplayFrameRecord)
            .filter(ReplayFrameRecord.replay_run_id == replay_run_id)
            .order_by(ReplayFrameRecord.frame_date)
            .all()
        )

    def get_frame_by_date(self, db: Session, symbol: str, date: str) -> ReplayFrameRecord | None:
        return (
            db.query(ReplayFrameRecord)
            .filter(ReplayFrameRecord.symbol == symbol, ReplayFrameRecord.frame_date == date)
            .order_by(desc(ReplayFrameRecord.created_at))
            .first()
        )


replay_repo = ReplayRepository()
