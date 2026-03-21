"""Repository for SimulationRun persistence."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.db.models import SimulationRun


class SimulationRunRepository:
    def create(
        self,
        db: Session,
        *,
        run_type: str = "current",
        symbol: str = "SPY",
        source: str = "worker",
        config_snapshot: dict | None = None,
    ) -> SimulationRun:
        run = SimulationRun(
            id=uuid.uuid4(),
            run_type=run_type,
            symbol=symbol,
            status="pending",
            source=source,
            config_snapshot=config_snapshot,
        )
        db.add(run)
        db.flush()
        return run

    def mark_running(self, db: Session, run_id: uuid.UUID) -> None:
        run = db.get(SimulationRun, run_id)
        if run:
            run.status = "running"
            run.started_at = datetime.now(timezone.utc)
            db.flush()

    def mark_completed(
        self, db: Session, run_id: uuid.UUID, summary: str, warnings: list[str] | None = None
    ) -> None:
        run = db.get(SimulationRun, run_id)
        if run:
            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            run.summary = summary
            run.warnings = warnings or []
            db.flush()

    def mark_failed(self, db: Session, run_id: uuid.UUID, error: str) -> None:
        run = db.get(SimulationRun, run_id)
        if run:
            run.status = "failed"
            run.completed_at = datetime.now(timezone.utc)
            run.error_message = error
            db.flush()

    def get_by_id(self, db: Session, run_id: uuid.UUID) -> SimulationRun | None:
        return (
            db.query(SimulationRun)
            .options(
                joinedload(SimulationRun.regime_snapshots),
                joinedload(SimulationRun.actor_states),
                joinedload(SimulationRun.scenario_branches),
                joinedload(SimulationRun.signal_summaries),
            )
            .filter(SimulationRun.id == run_id)
            .first()
        )

    def get_latest_completed(self, db: Session, symbol: str = "SPY") -> SimulationRun | None:
        return (
            db.query(SimulationRun)
            .options(
                joinedload(SimulationRun.regime_snapshots),
                joinedload(SimulationRun.actor_states),
                joinedload(SimulationRun.scenario_branches),
                joinedload(SimulationRun.signal_summaries),
            )
            .filter(SimulationRun.symbol == symbol, SimulationRun.status == "completed")
            .order_by(desc(SimulationRun.completed_at))
            .first()
        )

    def list_recent(self, db: Session, limit: int = 20) -> list[SimulationRun]:
        return (
            db.query(SimulationRun)
            .order_by(desc(SimulationRun.created_at))
            .limit(limit)
            .all()
        )


simulation_run_repo = SimulationRunRepository()
