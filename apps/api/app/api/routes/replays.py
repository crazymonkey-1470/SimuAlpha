"""Replay run listing and detail endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.replay import replay_repo
from app.schemas.replay import ReplayFrame
from app.schemas.runs import ReplayRunListResponse, ReplayRunRequest, ReplayRunSummary
from app.services.replay_persistence import replay_persistence

router = APIRouter()


def _parse_uuid(val: str) -> uuid.UUID:
    try:
        return uuid.UUID(val)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")


@router.get("", response_model=ReplayRunListResponse)
async def list_replay_runs(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> ReplayRunListResponse:
    runs = replay_repo.list_runs(db, limit=limit)
    return ReplayRunListResponse(
        runs=[
            ReplayRunSummary(
                id=str(r.id),
                symbol=r.symbol,
                start_date=r.start_date,
                end_date=r.end_date,
                status=r.status,
                summary=r.summary,
                frame_count=r.frame_count,
                created_at=r.created_at,
                completed_at=r.completed_at,
            )
            for r in runs
        ],
        total=len(runs),
    )


@router.get("/{replay_id}", response_model=ReplayRunSummary)
async def get_replay_run(replay_id: str, db: Session = Depends(get_db)) -> ReplayRunSummary:
    uid = _parse_uuid(replay_id)
    run = replay_repo.get_run_by_id(db, uid)
    if not run:
        raise HTTPException(status_code=404, detail="Replay run not found")
    return ReplayRunSummary(
        id=str(run.id),
        symbol=run.symbol,
        start_date=run.start_date,
        end_date=run.end_date,
        status=run.status,
        summary=run.summary,
        frame_count=run.frame_count,
        created_at=run.created_at,
        completed_at=run.completed_at,
    )


@router.get("/{replay_id}/frames", response_model=list[ReplayFrame])
async def get_replay_frames(replay_id: str, db: Session = Depends(get_db)) -> list[ReplayFrame]:
    uid = _parse_uuid(replay_id)
    records = replay_repo.get_frames_by_run(db, uid)
    frames = []
    for r in records:
        payload = r.snapshot_payload or {}
        frames.append(
            ReplayFrame(
                date=r.frame_date,
                regime=r.regime,
                regime_confidence=r.regime_confidence,
                net_pressure=r.net_pressure,
                actor_states=payload.get("actor_states", []),
                scenario_branches=payload.get("scenario_branches", []),
                realized_outcome=r.realized_outcome,
                notes=r.notes or "",
            )
        )
    return frames


@router.post("/run", response_model=ReplayRunSummary)
async def trigger_replay_run(
    request: ReplayRunRequest,
    db: Session = Depends(get_db),
) -> ReplayRunSummary:
    """Trigger a replay run. Currently runs synchronously."""
    run = replay_persistence.create_run(
        db, symbol=request.symbol, start_date=request.start_date, end_date=request.end_date
    )
    db.commit()

    try:
        import random

        from worker.engine.replay_engine import generate_replay_range

        seed = sum(ord(c) for c in request.start_date + request.end_date)
        frames = generate_replay_range(seed, request.start_date, request.end_date)

        for frame in frames:
            frame_dict = frame.model_dump(mode="python")
            replay_persistence.persist_frame(db, replay_run_id=run.id, frame_data=frame_dict)

        replay_persistence.mark_completed(db, run.id, f"{len(frames)} frames generated", len(frames))
        db.commit()
    except Exception as exc:
        replay_persistence.mark_failed(db, run.id, str(exc))
        db.commit()

    db.refresh(run)
    return ReplayRunSummary(
        id=str(run.id),
        symbol=run.symbol,
        start_date=run.start_date,
        end_date=run.end_date,
        status=run.status,
        summary=run.summary,
        frame_count=run.frame_count,
        created_at=run.created_at,
        completed_at=run.completed_at,
    )
