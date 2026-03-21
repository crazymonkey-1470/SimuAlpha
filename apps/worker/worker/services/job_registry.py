"""In-memory job run registry.

Tracks job runs with status, timestamps, and metadata.
Replace with database-backed persistence when Supabase integration
is connected.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from worker.core.logging import get_logger
from worker.schemas.system import JobRun, JobStatus, JobType

log = get_logger("svc.registry")

# In-memory store — replace with DB persistence later.
_runs: dict[str, JobRun] = {}


def create_run(job_type: JobType) -> JobRun:
    """Register a new job run and return it."""
    run = JobRun(
        run_id=f"run-{uuid.uuid4().hex[:12]}",
        job_type=job_type,
        status=JobStatus.PENDING,
        created_at=datetime.now(timezone.utc),
    )
    _runs[run.run_id] = run
    log.info("Created run %s (type=%s)", run.run_id, job_type.value)
    return run


def mark_running(run_id: str) -> None:
    run = _runs[run_id]
    run.status = JobStatus.RUNNING
    run.started_at = datetime.now(timezone.utc)
    log.info("Run %s → running", run_id)


def mark_completed(run_id: str, summary: str, warnings: list[str] | None = None) -> None:
    run = _runs[run_id]
    run.status = JobStatus.COMPLETED
    run.completed_at = datetime.now(timezone.utc)
    run.summary = summary
    run.warnings = warnings or []
    elapsed = (run.completed_at - (run.started_at or run.created_at)).total_seconds()
    log.info("Run %s → completed (%.2fs) %s", run_id, elapsed, summary)


def mark_failed(run_id: str, summary: str) -> None:
    run = _runs[run_id]
    run.status = JobStatus.FAILED
    run.completed_at = datetime.now(timezone.utc)
    run.summary = summary
    log.error("Run %s → failed: %s", run_id, summary)


def get_run(run_id: str) -> JobRun | None:
    return _runs.get(run_id)


def get_recent_runs(limit: int = 20) -> list[JobRun]:
    runs = sorted(_runs.values(), key=lambda r: r.created_at, reverse=True)
    return runs[:limit]
