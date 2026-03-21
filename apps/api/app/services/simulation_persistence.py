"""Service for persisting simulation results to the database.

Provides the bridge between the simulation engine output and the
database persistence layer. Used by both the API (for on-demand runs)
and the worker (for background runs).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models import SimulationRun, SystemStatusRecord
from app.repositories.actor import actor_repo
from app.repositories.regime import regime_repo
from app.repositories.scenario import scenario_repo
from app.repositories.signal import signal_repo
from app.repositories.simulation_run import simulation_run_repo


class SimulationPersistenceService:
    def create_run(
        self,
        db: Session,
        *,
        run_type: str = "current",
        symbol: str = "SPY",
        source: str = "worker",
        config_snapshot: dict | None = None,
    ) -> SimulationRun:
        return simulation_run_repo.create(
            db,
            run_type=run_type,
            symbol=symbol,
            source=source,
            config_snapshot=config_snapshot,
        )

    def mark_running(self, db: Session, run_id: uuid.UUID) -> None:
        simulation_run_repo.mark_running(db, run_id)

    def persist_results(
        self,
        db: Session,
        *,
        run_id: uuid.UUID,
        regime_data: dict,
        actors_data: list[dict],
        scenarios_data: list[dict],
        signal_data: dict,
        symbol: str = "SPY",
    ) -> None:
        """Persist all simulation output records for a run."""
        regime_data["symbol"] = symbol
        regime_repo.create(db, run_id=run_id, data=regime_data)

        for actor in actors_data:
            actor["symbol"] = symbol
        actor_repo.create_many(db, run_id=run_id, actors=actors_data)

        for scenario in scenarios_data:
            scenario["symbol"] = symbol
        scenario_repo.create_many(db, run_id=run_id, scenarios=scenarios_data)

        signal_data["symbol"] = symbol
        signal_repo.create(db, run_id=run_id, data=signal_data)

    def mark_completed(
        self, db: Session, run_id: uuid.UUID, summary: str, warnings: list[str] | None = None
    ) -> None:
        simulation_run_repo.mark_completed(db, run_id, summary, warnings)
        self._update_system_status(db)

    def mark_failed(self, db: Session, run_id: uuid.UUID, error: str) -> None:
        simulation_run_repo.mark_failed(db, run_id, error)

    def _update_system_status(self, db: Session) -> None:
        """Update the singleton system status record after a successful simulation."""
        status = db.get(SystemStatusRecord, 1)
        if not status:
            status = SystemStatusRecord(id=1)
            db.add(status)
        status.last_successful_simulation = datetime.now(timezone.utc)
        status.updated_at = datetime.now(timezone.utc)
        db.flush()


simulation_persistence = SimulationPersistenceService()
