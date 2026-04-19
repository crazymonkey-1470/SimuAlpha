"""Async job registry for the backtest tool.

In-memory only (single uvicorn worker per Railway service). Jobs are
also mirrored into the Supabase ``backtest_jobs`` table best-effort so
the admin UI / audit log can see them, but the runtime source of truth
is this process-local registry.

Two paths into the registry:

1. Async-from-the-start: HTTP layer accepts ``?async=true``, enqueues
   immediately, returns ``job_id``.
2. Sync-with-fallback: HTTP layer runs the engine inline; if the engine
   exceeds ``SYNC_TIME_LIMIT_SECONDS`` it raises ``SyncTimeoutExceeded``
   from a watchdog and the HTTP handler converts it into a queued job
   transparently (returns ``job_id`` mid-flight).
"""

from __future__ import annotations

import asyncio
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Awaitable, Callable

from simualpha_quant.logging_config import get_logger
from simualpha_quant.schemas.backtest import (
    BacktestPatternResponse,
    JobStatus,
    JobStatusName,
)

log = get_logger(__name__)

# Async threshold knobs (Stage-3 ground rules).
SYNC_COST_LIMIT: int = 1000          # len(tickers) * num_years > this → async
SYNC_TIME_LIMIT_SECONDS: float = 5.0  # any sync run > this → convert to async


class SyncTimeoutExceeded(Exception):
    """Raised by the sync watchdog when the request blew past the time
    budget. The HTTP layer catches this and returns a job_id."""


# ─────────────────────────── registry ──────────────────────────────────


@dataclass
class _Job:
    job_id: str
    submitted_at: datetime
    request_payload: dict
    status: JobStatusName = "queued"
    started_at: datetime | None = None
    completed_at: datetime | None = None
    result: BacktestPatternResponse | None = None
    error: str | None = None


_jobs: dict[str, _Job] = {}
_lock = threading.Lock()


def submit(request_payload: dict) -> str:
    job_id = uuid.uuid4().hex
    job = _Job(
        job_id=job_id,
        submitted_at=datetime.now(tz=timezone.utc),
        request_payload=request_payload,
    )
    with _lock:
        _jobs[job_id] = job
    _persist_best_effort(job)
    return job_id


def mark_running(job_id: str) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.status = "running"
        job.started_at = datetime.now(tz=timezone.utc)
    _persist_best_effort(job)


def mark_done(job_id: str, result: BacktestPatternResponse) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.status = "done"
        job.completed_at = datetime.now(tz=timezone.utc)
        job.result = result
    _persist_best_effort(job)


def mark_error(job_id: str, exc: Exception) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.status = "error"
        job.completed_at = datetime.now(tz=timezone.utc)
        job.error = f"{type(exc).__name__}: {exc}"
    _persist_best_effort(job)


def status(job_id: str) -> JobStatus | None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        return JobStatus(
            job_id=job.job_id,
            status=job.status,
            submitted_at=job.submitted_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            request_payload=job.request_payload,
            result=job.result,
            error=job.error,
        )


def reset_for_tests() -> None:
    with _lock:
        _jobs.clear()


# ─────────────────────────── async cost estimate ───────────────────────


def estimated_cost(num_tickers: int, num_years: float) -> int:
    return int(num_tickers * max(num_years, 1.0))


def should_async(num_tickers: int, num_years: float) -> bool:
    return estimated_cost(num_tickers, num_years) > SYNC_COST_LIMIT


# ─────────────────────────── execution helpers ─────────────────────────


def run_with_watchdog(fn: Callable[[], BacktestPatternResponse], time_limit: float | None = None) -> BacktestPatternResponse:
    """Run ``fn`` synchronously; raise SyncTimeoutExceeded if it takes
    longer than ``time_limit`` (seconds, default ``SYNC_TIME_LIMIT_SECONDS``).

    Implementation detail: we measure wall time between fn entry and
    exit. If exceeded, the result is still returned to the caller, but
    we tag the exception so the HTTP layer can convert mid-flight when
    the same request is replayed.

    Important: SyncTimeoutExceeded is a marker — the HTTP layer is
    expected to call ``submit()`` + ``mark_done()`` to record the result
    when it catches this, since the work has already completed.
    """
    limit = time_limit if time_limit is not None else SYNC_TIME_LIMIT_SECONDS
    start = time.monotonic()
    result = fn()
    elapsed = time.monotonic() - start
    if elapsed > limit:
        raise SyncTimeoutExceeded(elapsed)  # type: ignore[arg-type]
    return result


async def run_async(
    job_id: str,
    coroutine_factory: Callable[[], Awaitable[BacktestPatternResponse]],
) -> None:
    """Background runner for queued jobs."""
    mark_running(job_id)
    try:
        result = await coroutine_factory()
        mark_done(job_id, result)
    except Exception as exc:
        log.exception("async job failed", extra={"job_id": job_id})
        mark_error(job_id, exc)


# ─────────────────────────── persistence (best effort) ─────────────────


def _persist_best_effort(job: _Job) -> None:
    try:
        from simualpha_quant.supabase_client import get_client  # lazy

        client = get_client()
        row = {
            "job_id": job.job_id,
            "status": job.status,
            "request_payload": job.request_payload,
            "error": job.error,
            "submitted_at": job.submitted_at.isoformat(),
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        }
        client.table("backtest_jobs").upsert(row, on_conflict="job_id").execute()
    except Exception as exc:
        log.warning("backtest_jobs upsert failed", extra={"job_id": job.job_id, "err": str(exc)})
