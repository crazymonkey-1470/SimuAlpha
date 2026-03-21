"""Run history and detail endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.actor import actor_repo
from app.repositories.regime import regime_repo
from app.repositories.scenario import scenario_repo
from app.repositories.signal import signal_repo
from app.repositories.simulation_run import simulation_run_repo
from app.schemas.actors import ActorSensitivity, ActorState, ActorStateResponse
from app.schemas.regime import RegimeDriver, RegimeSnapshot
from app.schemas.runs import RunListResponse, RunSummary
from app.schemas.scenarios import ActorReaction, ScenarioBranch, ScenarioResponse
from app.schemas.signals import SignalSummary

router = APIRouter()


def _parse_uuid(run_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid run ID format")


@router.get("", response_model=RunListResponse)
async def list_runs(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> RunListResponse:
    runs = simulation_run_repo.list_recent(db, limit=limit)
    return RunListResponse(
        runs=[
            RunSummary(
                id=str(r.id),
                run_type=r.run_type,
                symbol=r.symbol,
                status=r.status,
                source=r.source,
                summary=r.summary,
                warnings=r.warnings or [],
                error_message=r.error_message,
                created_at=r.created_at,
                started_at=r.started_at,
                completed_at=r.completed_at,
            )
            for r in runs
        ],
        total=len(runs),
    )


@router.get("/{run_id}", response_model=RunSummary)
async def get_run(run_id: str, db: Session = Depends(get_db)) -> RunSummary:
    uid = _parse_uuid(run_id)
    run = simulation_run_repo.get_by_id(db, uid)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunSummary(
        id=str(run.id),
        run_type=run.run_type,
        symbol=run.symbol,
        status=run.status,
        source=run.source,
        summary=run.summary,
        warnings=run.warnings or [],
        error_message=run.error_message,
        created_at=run.created_at,
        started_at=run.started_at,
        completed_at=run.completed_at,
    )


@router.get("/{run_id}/regime", response_model=RegimeSnapshot)
async def get_run_regime(run_id: str, db: Session = Depends(get_db)) -> RegimeSnapshot:
    uid = _parse_uuid(run_id)
    records = regime_repo.get_by_run_id(db, uid)
    if not records:
        raise HTTPException(status_code=404, detail="No regime data for this run")
    r = records[0]
    return RegimeSnapshot(
        regime=r.regime,
        confidence=r.confidence,
        net_pressure=r.net_pressure,
        posture=r.posture,
        risk_flags=r.risk_flags or [],
        drivers=[RegimeDriver(**d) for d in (r.drivers or [])],
        summary=r.summary,
        updated_at=r.created_at,
    )


@router.get("/{run_id}/actors", response_model=ActorStateResponse)
async def get_run_actors(run_id: str, db: Session = Depends(get_db)) -> ActorStateResponse:
    uid = _parse_uuid(run_id)
    records = actor_repo.get_by_run_id(db, uid)
    actors = [
        ActorState(
            id=str(r.id),
            name=r.actor_name,
            archetype=r.archetype,
            bias=r.bias,
            conviction=r.conviction,
            contribution=r.contribution,
            horizon=r.horizon,
            sensitivities=[ActorSensitivity(**s) for s in (r.sensitivities or [])],
            recent_change=r.recent_change or "",
            confidence=r.confidence,
        )
        for r in records
    ]
    return ActorStateResponse(actors=actors, actor_count=len(actors))


@router.get("/{run_id}/scenarios", response_model=ScenarioResponse)
async def get_run_scenarios(run_id: str, db: Session = Depends(get_db)) -> ScenarioResponse:
    uid = _parse_uuid(run_id)
    records = scenario_repo.get_by_run_id(db, uid)
    scenarios = [
        ScenarioBranch(
            id=str(r.id),
            name=r.branch_name,
            probability=r.probability,
            direction=r.direction,
            drivers=r.drivers or [],
            invalidation_conditions=r.invalidation_conditions or [],
            actor_reactions=[ActorReaction(**ar) for ar in (r.actor_reactions or [])],
            risk_level=r.risk_level,
            notes=r.notes or "",
        )
        for r in records
    ]
    base_id = str(records[0].id) if records else ""
    return ScenarioResponse(scenarios=scenarios, base_case_id=base_id)


@router.get("/{run_id}/signals", response_model=SignalSummary)
async def get_run_signals(run_id: str, db: Session = Depends(get_db)) -> SignalSummary:
    uid = _parse_uuid(run_id)
    records = signal_repo.get_by_run_id(db, uid)
    if not records:
        raise HTTPException(status_code=404, detail="No signal data for this run")
    r = records[0]
    return SignalSummary(
        bias=r.bias,
        confidence=r.confidence,
        time_horizon=r.time_horizon,
        suggested_posture=r.suggested_posture,
        warnings=r.warnings or [],
        change_vs_prior=r.change_vs_prior or "",
        updated_at=r.created_at,
    )
