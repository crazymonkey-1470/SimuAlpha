"""Scheduled job definitions — scaffold.

This module will define the cron/interval schedule for recurring
simulation and calibration jobs when a scheduler (e.g., APScheduler
or a Redis-based scheduler) is integrated.

Future implementation will support:
- Periodic simulation runs (e.g., every 30 minutes during market hours)
- Daily calibration runs (e.g., 06:00 UTC)
- Weekly replay generation
- Health check heartbeats
"""

from __future__ import annotations

from worker.core.logging import get_logger

log = get_logger("job.scheduled")


# ── Schedule definitions (declarative, for future scheduler integration) ─────

SCHEDULE: list[dict] = [
    {
        "name": "simulation_periodic",
        "job": "worker.jobs.simulation_job:execute",
        "trigger": "interval",
        "minutes": 30,
        "description": "Run simulation every 30 minutes during market hours",
        "enabled": False,  # Enable when scheduler is integrated
    },
    {
        "name": "calibration_daily",
        "job": "worker.jobs.calibration_job:execute",
        "trigger": "cron",
        "hour": 6,
        "minute": 0,
        "description": "Daily model calibration at 06:00 UTC",
        "enabled": False,
    },
    {
        "name": "replay_weekly",
        "job": "worker.jobs.replay_job:execute_range",
        "trigger": "cron",
        "day_of_week": "sun",
        "hour": 2,
        "minute": 0,
        "description": "Weekly replay generation for prior week",
        "enabled": False,
    },
]


def get_schedule() -> list[dict]:
    """Return the schedule definitions."""
    return SCHEDULE


def print_schedule() -> None:
    """Log the configured schedule."""
    log.info("─── Scheduled Jobs ───")
    for entry in SCHEDULE:
        status = "enabled" if entry["enabled"] else "disabled"
        log.info("  %-25s %s [%s]", entry["name"], entry["description"], status)
    log.info("─── End Schedule ───")
