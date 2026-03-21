"""Repository for ActorStateRecord persistence."""

from __future__ import annotations

import uuid

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.models import ActorStateRecord


class ActorRepository:
    def create(self, db: Session, *, run_id: uuid.UUID, data: dict) -> ActorStateRecord:
        record = ActorStateRecord(
            id=uuid.uuid4(),
            run_id=run_id,
            symbol=data.get("symbol", "SPY"),
            actor_name=data["name"],
            archetype=data["archetype"],
            bias=data["bias"],
            conviction=data["conviction"],
            contribution=data["contribution"],
            confidence=data["confidence"],
            horizon=data["horizon"],
            rationale=data.get("rationale"),
            sensitivities=data.get("sensitivities"),
            recent_change=data.get("recent_change"),
            market_timestamp=data.get("market_timestamp"),
        )
        db.add(record)
        db.flush()
        return record

    def create_many(self, db: Session, *, run_id: uuid.UUID, actors: list[dict]) -> list[ActorStateRecord]:
        records = []
        for data in actors:
            records.append(self.create(db, run_id=run_id, data=data))
        return records

    def get_latest_by_symbol(self, db: Session, symbol: str = "SPY") -> list[ActorStateRecord]:
        """Get actor states from the most recent completed run."""
        from app.db.models import SimulationRun

        latest_run = (
            db.query(SimulationRun)
            .filter(SimulationRun.symbol == symbol, SimulationRun.status == "completed")
            .order_by(desc(SimulationRun.completed_at))
            .first()
        )
        if not latest_run:
            return []
        return db.query(ActorStateRecord).filter(ActorStateRecord.run_id == latest_run.id).all()

    def get_by_run_id(self, db: Session, run_id: uuid.UUID) -> list[ActorStateRecord]:
        return db.query(ActorStateRecord).filter(ActorStateRecord.run_id == run_id).all()


actor_repo = ActorRepository()
