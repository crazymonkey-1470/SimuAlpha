"""Calibration run listing and detail endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.calibration import calibration_repo
from app.schemas.runs import CalibrationRunListResponse, CalibrationRunRequest, CalibrationRunSummary
from app.services.calibration_service import calibration_persistence

router = APIRouter()


def _parse_uuid(val: str) -> uuid.UUID:
    try:
        return uuid.UUID(val)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")


@router.get("", response_model=CalibrationRunListResponse)
async def list_calibrations(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> CalibrationRunListResponse:
    runs = calibration_repo.list_recent(db, limit=limit)
    return CalibrationRunListResponse(
        runs=[
            CalibrationRunSummary(
                id=str(r.id),
                symbol=r.symbol,
                period_name=r.period_name,
                start_date=r.start_date,
                end_date=r.end_date,
                status=r.status,
                summary=r.summary,
                metrics=r.metrics,
                created_at=r.created_at,
                completed_at=r.completed_at,
            )
            for r in runs
        ],
        total=len(runs),
    )


@router.get("/{calibration_id}", response_model=CalibrationRunSummary)
async def get_calibration(calibration_id: str, db: Session = Depends(get_db)) -> CalibrationRunSummary:
    uid = _parse_uuid(calibration_id)
    run = calibration_repo.get_by_id(db, uid)
    if not run:
        raise HTTPException(status_code=404, detail="Calibration not found")
    return CalibrationRunSummary(
        id=str(run.id),
        symbol=run.symbol,
        period_name=run.period_name,
        start_date=run.start_date,
        end_date=run.end_date,
        status=run.status,
        summary=run.summary,
        metrics=run.metrics,
        created_at=run.created_at,
        completed_at=run.completed_at,
    )


@router.post("/run", response_model=CalibrationRunSummary)
async def trigger_calibration(
    request: CalibrationRunRequest,
    db: Session = Depends(get_db),
) -> CalibrationRunSummary:
    """Trigger a calibration run. Currently runs synchronously."""
    run = calibration_persistence.create_run(
        db,
        symbol=request.symbol,
        period_name=request.period_name,
        start_date=request.start_date,
        end_date=request.end_date,
    )
    db.commit()

    try:
        # Attempt actual calibration
        from worker.jobs.calibration_job import execute

        execute(
            period_name=request.period_name,
            start_date=request.start_date,
            end_date=request.end_date,
        )
        # Refresh to get updated status from worker persistence
        db.refresh(run)
    except Exception as exc:
        calibration_persistence.mark_failed(db, run.id, str(exc))
        db.commit()

    db.refresh(run)
    return CalibrationRunSummary(
        id=str(run.id),
        symbol=run.symbol,
        period_name=run.period_name,
        start_date=run.start_date,
        end_date=run.end_date,
        status=run.status,
        summary=run.summary,
        metrics=run.metrics,
        created_at=run.created_at,
        completed_at=run.completed_at,
    )
