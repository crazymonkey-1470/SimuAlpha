"""Scheduled job definitions — now powered by rq-scheduler.

This module provides backward-compatible schedule introspection.
Actual scheduling is handled by worker.queue.scheduler.
"""

from __future__ import annotations

from worker.core.logging import get_logger

log = get_logger("job.scheduled")


def get_schedule() -> list[dict]:
    """Return the schedule definitions from the queue scheduler."""
    from worker.queue.scheduler import get_schedule_definitions

    return get_schedule_definitions()


def print_schedule() -> None:
    """Log the configured schedule."""
    from worker.queue.scheduler import get_schedule_definitions

    defs = get_schedule_definitions()
    log.info("─── Scheduled Jobs (rq-scheduler) ───")
    for entry in defs:
        log.info("  %-25s %-20s %s", entry["id"], entry["cron_string"], entry["description"])
    log.info("─── End Schedule ───")
    log.info("Start scheduler: python -m worker.main scheduler")
