"""Scheduled job registration for SimuAlpha using rq-scheduler.

Registers recurring jobs:
- Daily simulation run (06:30 UTC, after market data settles)
- Daily market data refresh (06:00 UTC)
- Weekly calibration run (Sunday 03:00 UTC)
- Weekly replay generation (Sunday 04:00 UTC)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from rq_scheduler import Scheduler

from worker.core.logging import get_logger
from worker.queue.connection import (
    QUEUE_CALIBRATION,
    QUEUE_MAINTENANCE,
    QUEUE_REPLAY,
    QUEUE_SIMULATION,
    get_redis,
)

log = get_logger("queue.scheduler")


# ── Schedule definitions ──────────────────────────────────────────────────

SCHEDULED_JOBS = [
    {
        "id": "daily_simulation",
        "func": "worker.queue.scheduled_tasks.daily_simulation",
        "description": "Daily simulation run for core symbols",
        "trigger": "cron",
        "cron_string": "30 6 * * 1-5",  # Mon-Fri at 06:30 UTC
        "queue_name": QUEUE_SIMULATION,
        "timeout": 600,
    },
    {
        "id": "daily_data_refresh",
        "func": "worker.queue.scheduled_tasks.daily_data_refresh",
        "description": "Daily market data refresh",
        "trigger": "cron",
        "cron_string": "0 6 * * 1-5",  # Mon-Fri at 06:00 UTC
        "queue_name": QUEUE_MAINTENANCE,
        "timeout": 900,
    },
    {
        "id": "weekly_calibration",
        "func": "worker.queue.scheduled_tasks.weekly_calibration",
        "description": "Weekly calibration run across benchmark periods",
        "trigger": "cron",
        "cron_string": "0 3 * * 0",  # Sunday at 03:00 UTC
        "queue_name": QUEUE_CALIBRATION,
        "timeout": 1800,
    },
    {
        "id": "weekly_replay",
        "func": "worker.queue.scheduled_tasks.weekly_replay",
        "description": "Weekly replay generation for prior week",
        "trigger": "cron",
        "cron_string": "0 4 * * 0",  # Sunday at 04:00 UTC
        "queue_name": QUEUE_REPLAY,
        "timeout": 1800,
    },
]


def get_schedule_definitions() -> list[dict]:
    """Return the schedule definitions for inspection."""
    return SCHEDULED_JOBS


def create_scheduler() -> Scheduler:
    """Create an rq-scheduler instance connected to Redis."""
    conn = get_redis()
    scheduler = Scheduler(connection=conn, interval=60)
    return scheduler


def register_scheduled_jobs(scheduler: Scheduler) -> None:
    """Register all scheduled jobs with the rq-scheduler.

    Cancels existing jobs first to avoid duplicates on restart.
    """
    # Cancel any previously scheduled jobs by our IDs
    for job in scheduler.get_jobs():
        if hasattr(job, "meta") and job.meta.get("scheduled_id") in {
            j["id"] for j in SCHEDULED_JOBS
        }:
            scheduler.cancel(job)
            log.info("Cancelled stale scheduled job: %s", job.meta.get("scheduled_id"))

    for job_def in SCHEDULED_JOBS:
        scheduler.cron(
            job_def["cron_string"],
            func=job_def["func"],
            queue_name=job_def["queue_name"],
            timeout=job_def["timeout"],
            id=job_def["id"],
            meta={"scheduled_id": job_def["id"], "description": job_def["description"]},
            use_local_timezone=False,
        )
        log.info(
            "Registered scheduled job: %s (%s) → %s",
            job_def["id"],
            job_def["cron_string"],
            job_def["description"],
        )


def run_scheduler() -> None:
    """Start the scheduler process. Blocks forever."""
    log.info("Starting SimuAlpha scheduler...")
    scheduler = create_scheduler()
    register_scheduled_jobs(scheduler)
    log.info("Scheduler running. %d jobs registered.", len(SCHEDULED_JOBS))
    scheduler.run()
