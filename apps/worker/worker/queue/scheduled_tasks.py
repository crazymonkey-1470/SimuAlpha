"""Scheduled task implementations.

These are the actual functions invoked by rq-scheduler on a cron schedule.
Each function creates the appropriate DB record, then executes the job
directly (since the scheduler already runs inside an RQ worker context).
"""

from __future__ import annotations

from datetime import date, timedelta

from worker.core.logging import get_logger, setup_logging

log = get_logger("queue.scheduled_tasks")


def daily_simulation() -> dict:
    """Run the daily simulation for SPY."""
    setup_logging()
    log.info("Scheduled: daily_simulation triggered")

    from worker.queue.tasks import run_simulation
    from worker.persistence import create_simulation_run

    today = date.today()
    daily_seed = today.year * 10000 + today.month * 100 + today.day

    db_run_id = create_simulation_run(
        run_type="current",
        symbol="SPY",
        source="scheduler",
        config_snapshot={"seed": daily_seed, "use_real_data": True, "scheduled": True},
    )
    if not db_run_id:
        raise RuntimeError("Failed to create scheduled simulation run record")

    return run_simulation(str(db_run_id), seed=daily_seed, use_real_data=True)


def daily_data_refresh() -> dict:
    """Refresh market data for core symbols."""
    setup_logging()
    log.info("Scheduled: daily_data_refresh triggered")

    from worker.queue.tasks import run_data_refresh
    from worker.persistence import create_simulation_run

    db_run_id = create_simulation_run(
        run_type="data_refresh",
        symbol="SPY",
        source="scheduler",
        config_snapshot={"job_type": "data_refresh", "scheduled": True},
    )
    if not db_run_id:
        raise RuntimeError("Failed to create scheduled data-refresh run record")

    return run_data_refresh(str(db_run_id))


def weekly_calibration() -> dict:
    """Run weekly calibration across benchmark periods."""
    setup_logging()
    log.info("Scheduled: weekly_calibration triggered")

    from worker.queue.tasks import run_calibration
    from worker.persistence import create_calibration_run

    db_run_id = create_calibration_run(
        period_name=None,
        start_date="2020-01-01",
        end_date="2024-12-31",
    )
    if not db_run_id:
        raise RuntimeError("Failed to create scheduled calibration run record")

    return run_calibration(str(db_run_id))


def weekly_replay() -> dict:
    """Generate replay frames for the prior week."""
    setup_logging()
    log.info("Scheduled: weekly_replay triggered")

    from worker.queue.tasks import run_replay
    from worker.persistence import create_replay_run

    today = date.today()
    end = today - timedelta(days=today.weekday() + 1)  # Last Sunday
    start = end - timedelta(days=4)  # Monday of prior week

    db_run_id = create_replay_run(
        start_date=start.isoformat(),
        end_date=end.isoformat(),
    )
    if not db_run_id:
        raise RuntimeError("Failed to create scheduled replay run record")

    return run_replay(
        str(db_run_id),
        start_date=start.isoformat(),
        end_date=end.isoformat(),
    )
