"""Job submission and monitoring endpoints.

POST endpoints enqueue jobs for async execution via RQ.
GET endpoints inspect job status from the database.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter()


# ── Request / Response schemas ────────────────────────────────────────────


class JobSubmitResponse(BaseModel):
    job_id: str
    job_type: str
    status: str
    enqueued_at: str
    message: str


class SimulationJobRequest(BaseModel):
    seed: int | None = Field(default=None, description="Fixed seed for reproducibility")
    use_real_data: bool = Field(default=False, description="Use real market data")
    symbol: str = Field(default="SPY")


class ReplayJobRequest(BaseModel):
    start_date: str = Field(description="Start date YYYY-MM-DD")
    end_date: str = Field(description="End date YYYY-MM-DD")
    symbol: str = Field(default="SPY")
    seed: int | None = None


class CalibrationJobRequest(BaseModel):
    period_name: str | None = Field(default=None, description="Benchmark period name")
    start_date: str = Field(default="2020-01-01")
    end_date: str = Field(default="2020-12-31")
    symbol: str = Field(default="SPY")


class DataRefreshJobRequest(BaseModel):
    symbol: str = Field(default="SPY")


class JobStatusResponse(BaseModel):
    id: str
    job_type: str
    status: str
    symbol: str
    source: str
    summary: str | None = None
    error_message: str | None = None
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_seconds: float | None = None


class JobListResponse(BaseModel):
    jobs: list[JobStatusResponse]
    total: int


# ── Job submission endpoints ──────────────────────────────────────────────


@router.post("/simulation", response_model=JobSubmitResponse)
async def submit_simulation_job(
    request: SimulationJobRequest,
    db: Session = Depends(get_db),
) -> JobSubmitResponse:
    """Enqueue a simulation job. Falls back to in-process execution if Redis is unavailable."""
    try:
        from app.services.job_runner import try_enqueue_or_run_inprocess

        result = try_enqueue_or_run_inprocess(
            "simulation",
            seed=request.seed,
            use_real_data=request.use_real_data,
            symbol=request.symbol,
        )
        return JobSubmitResponse(
            job_id=result["job_id"],
            job_type="simulation",
            status=result.get("status", "queued"),
            enqueued_at=result["enqueued_at"],
            message=result.get("message", f"Simulation job {result['job_id']} submitted"),
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to submit job: {exc}")


@router.post("/replay", response_model=JobSubmitResponse)
async def submit_replay_job(
    request: ReplayJobRequest,
    db: Session = Depends(get_db),
) -> JobSubmitResponse:
    """Enqueue a replay generation job. Requires Redis/worker service."""
    try:
        from app.services.job_runner import try_enqueue_or_run_inprocess

        result = try_enqueue_or_run_inprocess(
            "replay",
            start_date=request.start_date,
            end_date=request.end_date,
            symbol=request.symbol,
            seed=request.seed,
        )
        return JobSubmitResponse(
            job_id=result["job_id"],
            job_type="replay",
            status=result.get("status", "queued"),
            enqueued_at=result["enqueued_at"],
            message=result.get("message", f"Replay job {result['job_id']} submitted"),
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to submit job: {exc}")


@router.post("/calibration", response_model=JobSubmitResponse)
async def submit_calibration_job(
    request: CalibrationJobRequest,
    db: Session = Depends(get_db),
) -> JobSubmitResponse:
    """Enqueue a calibration job. Requires Redis/worker service."""
    try:
        from app.services.job_runner import try_enqueue_or_run_inprocess

        result = try_enqueue_or_run_inprocess(
            "calibration",
            period_name=request.period_name,
            start_date=request.start_date,
            end_date=request.end_date,
            symbol=request.symbol,
        )
        return JobSubmitResponse(
            job_id=result["job_id"],
            job_type="calibration",
            status=result.get("status", "queued"),
            enqueued_at=result["enqueued_at"],
            message=result.get("message", f"Calibration job {result['job_id']} submitted"),
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to submit job: {exc}")


@router.post("/data-refresh", response_model=JobSubmitResponse)
async def submit_data_refresh_job(
    request: DataRefreshJobRequest,
    db: Session = Depends(get_db),
) -> JobSubmitResponse:
    """Enqueue a market data refresh job. Requires Redis/worker service."""
    try:
        from app.services.job_runner import try_enqueue_or_run_inprocess

        result = try_enqueue_or_run_inprocess("data_refresh", symbol=request.symbol)
        return JobSubmitResponse(
            job_id=result["job_id"],
            job_type="data_refresh",
            status=result.get("status", "queued"),
            enqueued_at=result["enqueued_at"],
            message=result.get("message", f"Data refresh job {result['job_id']} submitted"),
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Failed to submit job: {exc}")


# ── Job monitoring endpoints ──────────────────────────────────────────────


def _parse_uuid(val: str) -> uuid.UUID:
    try:
        return uuid.UUID(val)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")


def _run_to_response(run, job_type: str) -> JobStatusResponse:
    """Convert a DB run record to a JobStatusResponse."""
    duration = None
    started = getattr(run, "started_at", None)
    completed = getattr(run, "completed_at", None)
    if started and completed:
        duration = (completed - started).total_seconds()

    return JobStatusResponse(
        id=str(run.id),
        job_type=job_type,
        status=run.status,
        symbol=getattr(run, "symbol", "SPY"),
        source=getattr(run, "source", "unknown"),
        summary=getattr(run, "summary", None),
        error_message=getattr(run, "error_message", None),
        warnings=getattr(run, "warnings", None) or [],
        created_at=run.created_at,
        started_at=started,
        completed_at=completed,
        duration_seconds=duration,
    )


@router.get("", response_model=JobListResponse)
async def list_jobs(
    status: str | None = Query(default=None, description="Filter by status"),
    job_type: str | None = Query(default=None, description="Filter by job type: simulation, replay, calibration"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> JobListResponse:
    """List recent jobs across all types."""
    from app.db.models import CalibrationRun, ReplayRun, SimulationRun

    jobs: list[JobStatusResponse] = []

    # Simulation runs
    if job_type is None or job_type in ("simulation", "data_refresh"):
        q = db.query(SimulationRun).order_by(SimulationRun.created_at.desc())
        if status:
            q = q.filter(SimulationRun.status == status)
        if job_type == "data_refresh":
            q = q.filter(SimulationRun.run_type == "data_refresh")
        elif job_type == "simulation":
            q = q.filter(SimulationRun.run_type != "data_refresh")
        for run in q.limit(limit).all():
            jtype = "data_refresh" if run.run_type == "data_refresh" else "simulation"
            jobs.append(_run_to_response(run, jtype))

    # Replay runs
    if job_type is None or job_type == "replay":
        q = db.query(ReplayRun).order_by(ReplayRun.created_at.desc())
        if status:
            q = q.filter(ReplayRun.status == status)
        for run in q.limit(limit).all():
            jobs.append(_run_to_response(run, "replay"))

    # Calibration runs
    if job_type is None or job_type == "calibration":
        q = db.query(CalibrationRun).order_by(CalibrationRun.created_at.desc())
        if status:
            q = q.filter(CalibrationRun.status == status)
        for run in q.limit(limit).all():
            jobs.append(_run_to_response(run, "calibration"))

    # Sort all by created_at descending
    jobs.sort(key=lambda j: j.created_at, reverse=True)
    jobs = jobs[:limit]

    return JobListResponse(jobs=jobs, total=len(jobs))


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job(job_id: str, db: Session = Depends(get_db)) -> JobStatusResponse:
    """Get job status by ID. Searches across all job types."""
    uid = _parse_uuid(job_id)

    from app.db.models import CalibrationRun, ReplayRun, SimulationRun

    # Try simulation runs first
    run = db.get(SimulationRun, uid)
    if run:
        jtype = "data_refresh" if run.run_type == "data_refresh" else "simulation"
        return _run_to_response(run, jtype)

    # Try replay runs
    run = db.get(ReplayRun, uid)
    if run:
        return _run_to_response(run, "replay")

    # Try calibration runs
    run = db.get(CalibrationRun, uid)
    if run:
        return _run_to_response(run, "calibration")

    raise HTTPException(status_code=404, detail="Job not found")


@router.get("/{job_id}/status", response_model=dict)
async def get_job_status_brief(job_id: str, db: Session = Depends(get_db)) -> dict:
    """Get brief job status for polling."""
    job = await get_job(job_id, db)
    return {
        "job_id": job.id,
        "status": job.status,
        "summary": job.summary,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }
