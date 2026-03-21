"""Simulation job submission service — now creates real DB records and runs the engine."""

from __future__ import annotations

import os
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.schemas.simulation import SimulationRequest, SimulationRunResponse
from app.services.engine_bridge import invalidate_cache
from app.services.simulation_persistence import simulation_persistence


class SimulationService:
    def submit_run(self, request: SimulationRequest, db: Session | None = None) -> SimulationRunResponse:
        if db is not None:
            # Create a tracked run
            run = simulation_persistence.create_run(
                db,
                run_type="current",
                symbol="SPY",
                source="api",
                config_snapshot={
                    "horizon_days": request.horizon_days,
                    "num_paths": request.num_paths,
                    "notes": request.notes,
                },
            )
            db.commit()
            run_id = str(run.id)

            # Run synchronously for now (future: dispatch to queue)
            try:
                simulation_persistence.mark_running(db, run.id)
                db.commit()

                from worker.engine.simulation import run_current_simulation

                today = datetime.now(timezone.utc)
                daily_seed = today.year * 10000 + today.month * 100 + today.day
                use_real = os.environ.get("SIMUALPHA_USE_REAL_DATA", "false").lower() == "true"
                result = run_current_simulation(seed=daily_seed, use_real_data=use_real)
                raw = result.model_dump(mode="python")

                simulation_persistence.persist_results(
                    db,
                    run_id=run.id,
                    regime_data=raw["regime"],
                    actors_data=raw["actors"],
                    scenarios_data=raw["scenarios"],
                    signal_data=raw["signal"],
                )

                summary = f"regime={raw['regime']['regime']}, signal={raw['signal']['bias']}"
                simulation_persistence.mark_completed(db, run.id, summary)
                db.commit()

                invalidate_cache()

                return SimulationRunResponse(
                    run_id=run_id,
                    status="completed",
                    submitted_at=run.created_at,
                    message=f"Simulation {run_id} completed: {summary}",
                )

            except Exception as exc:
                simulation_persistence.mark_failed(db, run.id, str(exc))
                db.commit()
                return SimulationRunResponse(
                    run_id=run_id,
                    status="failed",
                    submitted_at=run.created_at,
                    message=f"Simulation failed: {exc}",
                )
        else:
            # Fallback: no DB
            import uuid

            run_id = f"sim-{uuid.uuid4().hex[:12]}"
            return SimulationRunResponse(
                run_id=run_id,
                status="queued",
                submitted_at=datetime.now(timezone.utc),
                message=f"Simulation {run_id} queued (no database available)",
            )


simulation_service = SimulationService()
