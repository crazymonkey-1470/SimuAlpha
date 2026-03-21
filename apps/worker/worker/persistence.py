"""Persistence helpers for the worker.

Uses the same database tables as the API. Imports the API's SQLAlchemy models
directly so both services share one schema definition.

This module provides thin wrappers so worker jobs can persist results
without depending on the full API service layer.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from worker.core.db import get_session
from worker.core.logging import get_logger

log = get_logger("persistence")

# Import the shared DB models from the API package.
# Both apps/api and apps/worker are installed in the same venv during local dev.
# In production, the worker can either import these models or use its own copy.
try:
    from app.db.models import (
        ActorStateRecord,
        CalibrationRun,
        RegimeSnapshotRecord,
        ReplayFrameRecord,
        ReplayRun,
        ScenarioBranchRecord,
        SignalSummaryRecord,
        SimulationRun,
        SystemStatusRecord,
    )

    DB_AVAILABLE = True
except ImportError:
    DB_AVAILABLE = False
    log.warning("API DB models not importable — persistence disabled")


def is_db_available() -> bool:
    """Check if DB persistence is available."""
    if not DB_AVAILABLE:
        return False
    try:
        session = get_session()
        session.execute("SELECT 1")  # type: ignore[arg-type]
        session.close()
        return True
    except Exception:
        return False


# ── Simulation persistence ─────────────────────────────────────────────────


def create_simulation_run(
    *,
    run_type: str = "current",
    symbol: str = "SPY",
    source: str = "worker",
    config_snapshot: dict | None = None,
) -> uuid.UUID | None:
    """Create a simulation run record and return its UUID, or None if DB unavailable."""
    if not DB_AVAILABLE:
        return None
    try:
        session = get_session()
        run = SimulationRun(
            id=uuid.uuid4(),
            run_type=run_type,
            symbol=symbol,
            status="pending",
            source=source,
            config_snapshot=config_snapshot,
        )
        session.add(run)
        session.commit()
        log.info("Created simulation run %s in DB", run.id)
        return run.id
    except Exception as exc:
        log.warning("Failed to create simulation run in DB: %s", exc)
        return None


def mark_simulation_running(run_id: uuid.UUID) -> None:
    if not DB_AVAILABLE:
        return
    try:
        session = get_session()
        run = session.get(SimulationRun, run_id)
        if run:
            run.status = "running"
            run.started_at = datetime.now(timezone.utc)
            session.commit()
    except Exception as exc:
        log.warning("Failed to mark run %s running: %s", run_id, exc)


def persist_simulation_results(
    run_id: uuid.UUID,
    *,
    regime_data: dict[str, Any],
    actors_data: list[dict[str, Any]],
    scenarios_data: list[dict[str, Any]],
    signal_data: dict[str, Any],
    symbol: str = "SPY",
) -> None:
    """Persist all simulation output records for a run."""
    if not DB_AVAILABLE:
        return
    try:
        session = get_session()

        # Regime
        session.add(RegimeSnapshotRecord(
            id=uuid.uuid4(),
            run_id=run_id,
            symbol=symbol,
            regime=regime_data["regime"],
            confidence=regime_data["confidence"],
            net_pressure=regime_data["net_pressure"],
            posture=regime_data.get("posture", ""),
            summary=regime_data.get("summary", ""),
            drivers=regime_data.get("drivers"),
            risk_flags=regime_data.get("risk_flags"),
        ))

        # Actors
        for actor in actors_data:
            session.add(ActorStateRecord(
                id=uuid.uuid4(),
                run_id=run_id,
                symbol=symbol,
                actor_name=actor["name"],
                archetype=actor["archetype"],
                bias=actor["bias"],
                conviction=actor["conviction"],
                contribution=actor["contribution"],
                confidence=actor["confidence"],
                horizon=actor["horizon"],
                sensitivities=actor.get("sensitivities"),
                recent_change=actor.get("recent_change"),
            ))

        # Scenarios
        for scenario in scenarios_data:
            session.add(ScenarioBranchRecord(
                id=uuid.uuid4(),
                run_id=run_id,
                symbol=symbol,
                branch_name=scenario["name"],
                probability=scenario["probability"],
                direction=scenario["direction"],
                drivers=scenario.get("drivers"),
                invalidation_conditions=scenario.get("invalidation_conditions"),
                actor_reactions=scenario.get("actor_reactions"),
                notes=scenario.get("notes"),
                risk_level=scenario["risk_level"],
            ))

        # Signal
        session.add(SignalSummaryRecord(
            id=uuid.uuid4(),
            run_id=run_id,
            symbol=symbol,
            bias=signal_data["bias"],
            confidence=signal_data["confidence"],
            time_horizon=signal_data["time_horizon"],
            suggested_posture=signal_data["suggested_posture"],
            warnings=signal_data.get("warnings"),
            change_vs_prior=signal_data.get("change_vs_prior"),
        ))

        session.commit()
        log.info("Persisted simulation results for run %s", run_id)

    except Exception as exc:
        log.warning("Failed to persist simulation results: %s", exc)


def mark_simulation_completed(run_id: uuid.UUID, summary: str, warnings: list[str] | None = None) -> None:
    if not DB_AVAILABLE:
        return
    try:
        session = get_session()
        run = session.get(SimulationRun, run_id)
        if run:
            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            run.summary = summary
            run.warnings = warnings or []
            session.commit()

        # Update system status
        status = session.get(SystemStatusRecord, 1)
        if not status:
            status = SystemStatusRecord(id=1)
            session.add(status)
        status.last_successful_simulation = datetime.now(timezone.utc)
        status.worker_status = "idle"
        status.updated_at = datetime.now(timezone.utc)
        session.commit()

    except Exception as exc:
        log.warning("Failed to mark run %s completed: %s", run_id, exc)


def mark_simulation_failed(run_id: uuid.UUID, error: str) -> None:
    if not DB_AVAILABLE:
        return
    try:
        session = get_session()
        run = session.get(SimulationRun, run_id)
        if run:
            run.status = "failed"
            run.completed_at = datetime.now(timezone.utc)
            run.error_message = error
            session.commit()
    except Exception as exc:
        log.warning("Failed to mark run %s failed: %s", run_id, exc)


# ── Replay persistence ─────────────────────────────────────────────────────


def create_replay_run(
    *, symbol: str = "SPY", start_date: str, end_date: str
) -> uuid.UUID | None:
    if not DB_AVAILABLE:
        return None
    try:
        session = get_session()
        run = ReplayRun(
            id=uuid.uuid4(),
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
            status="running",
        )
        session.add(run)
        session.commit()
        return run.id
    except Exception as exc:
        log.warning("Failed to create replay run: %s", exc)
        return None


def persist_replay_frame(
    replay_run_id: uuid.UUID,
    frame_data: dict[str, Any],
    *,
    symbol: str = "SPY",
) -> None:
    if not DB_AVAILABLE:
        return
    try:
        session = get_session()
        session.add(ReplayFrameRecord(
            id=uuid.uuid4(),
            replay_run_id=replay_run_id,
            symbol=symbol,
            frame_date=frame_data["date"],
            regime=frame_data["regime"],
            regime_confidence=frame_data["regime_confidence"],
            net_pressure=frame_data["net_pressure"],
            signal_bias=frame_data.get("signal_bias"),
            realized_outcome=frame_data.get("realized_outcome"),
            notes=frame_data.get("notes"),
            snapshot_payload={
                "actor_states": frame_data.get("actor_states", []),
                "scenario_branches": frame_data.get("scenario_branches", []),
            },
        ))
        session.commit()
    except Exception as exc:
        log.warning("Failed to persist replay frame: %s", exc)


def mark_replay_completed(run_id: uuid.UUID, summary: str, frame_count: int) -> None:
    if not DB_AVAILABLE:
        return
    try:
        session = get_session()
        run = session.get(ReplayRun, run_id)
        if run:
            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            run.summary = summary
            run.frame_count = frame_count
            session.commit()
    except Exception as exc:
        log.warning("Failed to mark replay %s completed: %s", run_id, exc)


def mark_replay_failed(run_id: uuid.UUID, error: str) -> None:
    if not DB_AVAILABLE:
        return
    try:
        session = get_session()
        run = session.get(ReplayRun, run_id)
        if run:
            run.status = "failed"
            run.completed_at = datetime.now(timezone.utc)
            run.summary = error
            session.commit()
    except Exception as exc:
        log.warning("Failed to mark replay %s failed: %s", run_id, exc)


# ── Calibration persistence ────────────────────────────────────────────────


def create_calibration_run(
    *, symbol: str = "SPY", period_name: str | None = None, start_date: str, end_date: str
) -> uuid.UUID | None:
    if not DB_AVAILABLE:
        return None
    try:
        session = get_session()
        run = CalibrationRun(
            id=uuid.uuid4(),
            symbol=symbol,
            period_name=period_name,
            start_date=start_date,
            end_date=end_date,
            status="running",
        )
        session.add(run)
        session.commit()
        return run.id
    except Exception as exc:
        log.warning("Failed to create calibration run: %s", exc)
        return None


def mark_calibration_completed(run_id: uuid.UUID, summary: str, metrics: dict) -> None:
    if not DB_AVAILABLE:
        return
    try:
        session = get_session()
        run = session.get(CalibrationRun, run_id)
        if run:
            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            run.summary = summary
            run.metrics = metrics
            session.commit()

        # Update system status
        status = session.get(SystemStatusRecord, 1)
        if not status:
            status = SystemStatusRecord(id=1)
            session.add(status)
        status.last_successful_calibration = datetime.now(timezone.utc)
        status.updated_at = datetime.now(timezone.utc)
        session.commit()
    except Exception as exc:
        log.warning("Failed to mark calibration %s completed: %s", run_id, exc)


def mark_calibration_failed(run_id: uuid.UUID, error: str) -> None:
    if not DB_AVAILABLE:
        return
    try:
        session = get_session()
        run = session.get(CalibrationRun, run_id)
        if run:
            run.status = "failed"
            run.completed_at = datetime.now(timezone.utc)
            run.summary = error
            session.commit()
    except Exception as exc:
        log.warning("Failed to mark calibration %s failed: %s", run_id, exc)
