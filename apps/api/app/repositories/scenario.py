"""Repository for ScenarioBranchRecord persistence."""

from __future__ import annotations

import uuid

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.models import ScenarioBranchRecord


class ScenarioRepository:
    def create(self, db: Session, *, run_id: uuid.UUID, data: dict) -> ScenarioBranchRecord:
        record = ScenarioBranchRecord(
            id=uuid.uuid4(),
            run_id=run_id,
            symbol=data.get("symbol", "SPY"),
            branch_name=data["name"],
            probability=data["probability"],
            direction=data["direction"],
            drivers=data.get("drivers"),
            invalidation_conditions=data.get("invalidation_conditions"),
            actor_reactions=data.get("actor_reactions"),
            notes=data.get("notes"),
            risk_level=data["risk_level"],
            market_timestamp=data.get("market_timestamp"),
        )
        db.add(record)
        db.flush()
        return record

    def create_many(self, db: Session, *, run_id: uuid.UUID, scenarios: list[dict]) -> list[ScenarioBranchRecord]:
        records = []
        for data in scenarios:
            records.append(self.create(db, run_id=run_id, data=data))
        return records

    def get_by_run_id(self, db: Session, run_id: uuid.UUID) -> list[ScenarioBranchRecord]:
        return db.query(ScenarioBranchRecord).filter(ScenarioBranchRecord.run_id == run_id).all()

    def get_latest_by_symbol(self, db: Session, symbol: str = "SPY") -> list[ScenarioBranchRecord]:
        from app.db.models import SimulationRun

        latest_run = (
            db.query(SimulationRun)
            .filter(SimulationRun.symbol == symbol, SimulationRun.status == "completed")
            .order_by(desc(SimulationRun.completed_at))
            .first()
        )
        if not latest_run:
            return []
        return db.query(ScenarioBranchRecord).filter(ScenarioBranchRecord.run_id == latest_run.id).all()


scenario_repo = ScenarioRepository()
