"""In-process job runner fallback when Redis/RQ is unavailable.

Runs jobs in a background thread so the API doesn't block.
Used when the worker service or Redis are not deployed.
"""

from __future__ import annotations

import logging
import threading
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_executor_lock = threading.Lock()


def _run_in_thread(target, args=(), kwargs=None):
    """Run a function in a daemon thread."""
    t = threading.Thread(target=target, args=args, kwargs=kwargs or {}, daemon=True)
    t.start()
    return t


def submit_simulation_inprocess(
    seed: int | None = None,
    use_real_data: bool = False,
    symbol: str = "SPY",
) -> dict:
    """Run simulation in-process as a fallback when Redis is not available."""
    from app.db.session import SessionLocal
    from app.services.engine_bridge import invalidate_cache
    from app.services.simulation_persistence import simulation_persistence

    run_id_str = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    db = SessionLocal()
    try:
        run = simulation_persistence.create_run(
            db, run_type="current", symbol=symbol, source="api-inprocess",
            config_snapshot={"seed": seed, "use_real_data": use_real_data},
        )
        db.commit()
        run_id_str = str(run.id)
    except Exception as exc:
        logger.warning("Failed to create run record: %s", exc)
        db.close()
        return {
            "job_id": run_id_str,
            "job_type": "simulation",
            "status": "failed",
            "enqueued_at": now.isoformat(),
        }

    def _execute():
        with _executor_lock:
            inner_db = SessionLocal()
            try:
                simulation_persistence.mark_running(inner_db, run.id)
                inner_db.commit()

                from worker.engine.simulation import run_current_simulation

                daily_seed = seed or (now.year * 10000 + now.month * 100 + now.day)
                result = run_current_simulation(seed=daily_seed, use_real_data=use_real_data)
                raw = result.model_dump(mode="python")

                simulation_persistence.persist_results(
                    inner_db, run_id=run.id,
                    regime_data=raw["regime"],
                    actors_data=raw["actors"],
                    scenarios_data=raw["scenarios"],
                    signal_data=raw["signal"],
                )
                summary = f"regime={raw['regime']['regime']}, signal={raw['signal']['bias']}"
                simulation_persistence.mark_completed(inner_db, run.id, summary)
                inner_db.commit()
                invalidate_cache()

                # Publish SSE event
                try:
                    from app.api.routes.events import publish_event
                    publish_event("simulation", "completed", {
                        "run_id": run_id_str, "summary": summary, "status": "completed",
                    })
                    publish_event("jobs", "completed", {
                        "job_id": run_id_str, "job_type": "simulation", "status": "completed",
                    })
                except Exception:
                    pass

                logger.info("In-process simulation %s completed: %s", run_id_str, summary)
            except Exception as exc:
                simulation_persistence.mark_failed(inner_db, run.id, str(exc))
                inner_db.commit()

                try:
                    from app.api.routes.events import publish_event
                    publish_event("simulation", "failed", {
                        "run_id": run_id_str, "error": str(exc), "status": "failed",
                    })
                except Exception:
                    pass

                logger.error("In-process simulation %s failed: %s", run_id_str, exc)
            finally:
                inner_db.close()

    _run_in_thread(_execute)
    db.close()

    return {
        "job_id": run_id_str,
        "job_type": "simulation",
        "status": "queued",
        "enqueued_at": now.isoformat(),
    }


def try_enqueue_or_run_inprocess(job_type: str, **kwargs) -> dict:
    """Try to enqueue via Redis/RQ, falling back to in-process execution."""
    try:
        from worker.queue.connection import ping_redis
        if ping_redis():
            if job_type == "simulation":
                from worker.queue.enqueue import enqueue_simulation
                return enqueue_simulation(**kwargs)
            elif job_type == "replay":
                from worker.queue.enqueue import enqueue_replay
                return enqueue_replay(**kwargs)
            elif job_type == "calibration":
                from worker.queue.enqueue import enqueue_calibration
                return enqueue_calibration(**kwargs)
            elif job_type == "data_refresh":
                from worker.queue.enqueue import enqueue_data_refresh
                return enqueue_data_refresh(**kwargs)
    except Exception as exc:
        logger.info("Redis unavailable (%s), using in-process fallback", exc)

    # Fallback to in-process
    if job_type == "simulation":
        return submit_simulation_inprocess(
            seed=kwargs.get("seed"),
            use_real_data=kwargs.get("use_real_data", False),
            symbol=kwargs.get("symbol", "SPY"),
        )

    # For non-simulation jobs without Redis, return a graceful error
    return {
        "job_id": str(uuid.uuid4()),
        "job_type": job_type,
        "status": "failed",
        "enqueued_at": datetime.now(timezone.utc).isoformat(),
        "message": f"Redis unavailable. {job_type} jobs require the worker service.",
    }
