"""System health, queue status, and operational monitoring endpoints."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.system import SystemStatus
from app.services.system import system_service

router = APIRouter()


# ── Response schemas ──────────────────────────────────────────────────────


class QueueInfo(BaseModel):
    name: str
    pending: int
    active: int
    failed: int


class QueueStatusResponse(BaseModel):
    redis_connected: bool
    queues: list[QueueInfo]
    total_pending: int
    total_active: int
    total_failed: int


class WorkerInfo(BaseModel):
    name: str
    state: str
    current_job: str | None = None
    queues: list[str]
    birth_date: str | None = None


class WorkerHealthResponse(BaseModel):
    redis_connected: bool
    workers: list[WorkerInfo]
    worker_count: int


class ScheduleEntry(BaseModel):
    id: str
    description: str
    cron_string: str
    queue_name: str


class ScheduleResponse(BaseModel):
    schedules: list[ScheduleEntry]
    scheduler_running: bool


# ── Endpoints ─────────────────────────────────────────────────────────────


@router.get("/status", response_model=SystemStatus)
async def system_status(db: Session = Depends(get_db)) -> SystemStatus:
    return system_service.get_status(db=db)


@router.get("/queue", response_model=QueueStatusResponse)
async def queue_status() -> QueueStatusResponse:
    """Get current queue depths and status."""
    try:
        from worker.queue.connection import get_all_queues, ping_redis

        if not ping_redis():
            return QueueStatusResponse(
                redis_connected=False, queues=[], total_pending=0, total_active=0, total_failed=0
            )

        queues = get_all_queues()
        infos = []
        total_pending = 0
        total_active = 0
        total_failed = 0

        for q in queues:
            pending = len(q)
            active = q.started_job_registry.count
            failed = q.failed_job_registry.count
            total_pending += pending
            total_active += active
            total_failed += failed
            infos.append(QueueInfo(name=q.name, pending=pending, active=active, failed=failed))

        return QueueStatusResponse(
            redis_connected=True,
            queues=infos,
            total_pending=total_pending,
            total_active=total_active,
            total_failed=total_failed,
        )
    except Exception:
        return QueueStatusResponse(
            redis_connected=False, queues=[], total_pending=0, total_active=0, total_failed=0
        )


@router.get("/worker-health", response_model=WorkerHealthResponse)
async def worker_health() -> WorkerHealthResponse:
    """Get worker process status."""
    try:
        from rq import Worker as RqWorker

        from worker.queue.connection import get_redis, ping_redis

        if not ping_redis():
            return WorkerHealthResponse(redis_connected=False, workers=[], worker_count=0)

        workers = RqWorker.all(connection=get_redis())
        infos = []
        for w in workers:
            current = None
            if w.get_current_job():
                current = w.get_current_job().id
            infos.append(WorkerInfo(
                name=w.name,
                state=w.get_state(),
                current_job=current,
                queues=[q.name for q in w.queues],
                birth_date=w.birth_date.isoformat() if w.birth_date else None,
            ))

        return WorkerHealthResponse(
            redis_connected=True, workers=infos, worker_count=len(infos)
        )
    except Exception:
        return WorkerHealthResponse(redis_connected=False, workers=[], worker_count=0)


@router.get("/schedules", response_model=ScheduleResponse)
async def scheduled_jobs() -> ScheduleResponse:
    """Get configured scheduled job definitions."""
    try:
        from worker.queue.scheduler import get_schedule_definitions

        defs = get_schedule_definitions()
        entries = [
            ScheduleEntry(
                id=d["id"],
                description=d["description"],
                cron_string=d["cron_string"],
                queue_name=d["queue_name"],
            )
            for d in defs
        ]

        # Check if scheduler process is running
        scheduler_running = False
        try:
            from worker.queue.connection import get_redis
            conn = get_redis()
            # rq-scheduler stores its PID in Redis
            scheduler_running = conn.exists("rq:scheduler:scheduler_lock") > 0
        except Exception:
            pass

        return ScheduleResponse(schedules=entries, scheduler_running=scheduler_running)
    except Exception:
        return ScheduleResponse(schedules=[], scheduler_running=False)
