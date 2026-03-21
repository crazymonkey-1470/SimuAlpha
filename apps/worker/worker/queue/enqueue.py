"""Job enqueue functions for SimuAlpha.

These create DB records first, then enqueue the RQ task.
The API calls these to submit async jobs.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from rq import Retry
from rq.job import Job

from worker.core.logging import get_logger
from worker.persistence import create_calibration_run, create_replay_run, create_simulation_run
from worker.queue.connection import (
    QUEUE_CALIBRATION,
    QUEUE_MAINTENANCE,
    QUEUE_REPLAY,
    QUEUE_SIMULATION,
    get_queue,
)

log = get_logger("queue.enqueue")


def enqueue_simulation(
    *,
    seed: int | None = None,
    use_real_data: bool = False,
    symbol: str = "SPY",
    source: str = "api",
) -> dict:
    """Create a simulation run record and enqueue it for async execution.

    Returns a dict with job metadata for the API response.
    """
    db_run_id = create_simulation_run(
        run_type="current",
        symbol=symbol,
        source=source,
        config_snapshot={"seed": seed, "use_real_data": use_real_data},
    )
    if not db_run_id:
        raise RuntimeError("Failed to create simulation run record in database")

    queue = get_queue(QUEUE_SIMULATION)
    job = queue.enqueue(
        "worker.queue.tasks.run_simulation",
        str(db_run_id),
        seed=seed,
        use_real_data=use_real_data,
        job_id=f"sim-{db_run_id}",
        job_timeout="10m",
        retry=Retry(max=2, interval=[30, 60]),
        meta={"job_type": "simulation", "symbol": symbol},
    )

    log.info("Enqueued simulation job: db_run_id=%s rq_job_id=%s", db_run_id, job.id)
    return {
        "job_id": str(db_run_id),
        "rq_job_id": job.id,
        "job_type": "simulation",
        "status": "queued",
        "symbol": symbol,
        "enqueued_at": datetime.now(timezone.utc).isoformat(),
    }


def enqueue_replay(
    *,
    start_date: str,
    end_date: str,
    symbol: str = "SPY",
    seed: int | None = None,
) -> dict:
    """Create a replay run record and enqueue it for async execution."""
    db_run_id = create_replay_run(
        symbol=symbol, start_date=start_date, end_date=end_date
    )
    if not db_run_id:
        raise RuntimeError("Failed to create replay run record in database")

    queue = get_queue(QUEUE_REPLAY)
    job = queue.enqueue(
        "worker.queue.tasks.run_replay",
        str(db_run_id),
        start_date=start_date,
        end_date=end_date,
        seed=seed,
        job_id=f"replay-{db_run_id}",
        job_timeout="30m",
        retry=Retry(max=1, interval=[60]),
        meta={"job_type": "replay", "symbol": symbol},
    )

    log.info("Enqueued replay job: db_run_id=%s rq_job_id=%s", db_run_id, job.id)
    return {
        "job_id": str(db_run_id),
        "rq_job_id": job.id,
        "job_type": "replay",
        "status": "queued",
        "symbol": symbol,
        "start_date": start_date,
        "end_date": end_date,
        "enqueued_at": datetime.now(timezone.utc).isoformat(),
    }


def enqueue_calibration(
    *,
    period_name: str | None = None,
    start_date: str = "2020-01-01",
    end_date: str = "2020-12-31",
    symbol: str = "SPY",
) -> dict:
    """Create a calibration run record and enqueue it for async execution."""
    db_run_id = create_calibration_run(
        symbol=symbol,
        period_name=period_name,
        start_date=start_date,
        end_date=end_date,
    )
    if not db_run_id:
        raise RuntimeError("Failed to create calibration run record in database")

    queue = get_queue(QUEUE_CALIBRATION)
    job = queue.enqueue(
        "worker.queue.tasks.run_calibration",
        str(db_run_id),
        period_name=period_name,
        start_date=start_date,
        end_date=end_date,
        job_id=f"cal-{db_run_id}",
        job_timeout="30m",
        retry=Retry(max=1, interval=[60]),
        meta={"job_type": "calibration", "symbol": symbol},
    )

    log.info("Enqueued calibration job: db_run_id=%s rq_job_id=%s", db_run_id, job.id)
    return {
        "job_id": str(db_run_id),
        "rq_job_id": job.id,
        "job_type": "calibration",
        "status": "queued",
        "symbol": symbol,
        "enqueued_at": datetime.now(timezone.utc).isoformat(),
    }


def enqueue_data_refresh(*, symbol: str = "SPY") -> dict:
    """Create a data-refresh run record and enqueue it."""
    db_run_id = create_simulation_run(
        run_type="data_refresh",
        symbol=symbol,
        source="scheduler",
        config_snapshot={"job_type": "data_refresh"},
    )
    if not db_run_id:
        raise RuntimeError("Failed to create data-refresh run record in database")

    queue = get_queue(QUEUE_MAINTENANCE)
    job = queue.enqueue(
        "worker.queue.tasks.run_data_refresh",
        str(db_run_id),
        job_id=f"refresh-{db_run_id}",
        job_timeout="15m",
        meta={"job_type": "data_refresh", "symbol": symbol},
    )

    log.info("Enqueued data-refresh job: db_run_id=%s rq_job_id=%s", db_run_id, job.id)
    return {
        "job_id": str(db_run_id),
        "rq_job_id": job.id,
        "job_type": "data_refresh",
        "status": "queued",
        "symbol": symbol,
        "enqueued_at": datetime.now(timezone.utc).isoformat(),
    }
