"""RQ task functions for SimuAlpha job execution.

These are the actual functions that RQ workers invoke. Each task:
1. Updates the DB run record to 'running'
2. Executes the job
3. Marks the DB record as 'completed' or 'failed'

All tasks accept a db_run_id (UUID string) which maps to an existing
database record created at enqueue time.
"""

from __future__ import annotations

import traceback
import uuid

from worker.core.logging import get_logger, setup_logging

log = get_logger("queue.tasks")


def run_simulation(db_run_id: str, *, seed: int | None = None, use_real_data: bool = False) -> dict:
    """Execute a simulation job. Called by RQ worker."""
    setup_logging()
    log.info("Task run_simulation started: db_run_id=%s", db_run_id)

    from worker.persistence import (
        mark_simulation_completed,
        mark_simulation_failed,
        mark_simulation_running,
        persist_simulation_results,
    )
    from worker.services.simulation_service import run_simulation as run_sim

    run_uuid = uuid.UUID(db_run_id)

    mark_simulation_running(run_uuid)

    try:
        output = run_sim(seed=seed, use_real_data=use_real_data)
        raw = output.model_dump(mode="python")

        persist_simulation_results(
            run_uuid,
            regime_data=raw["regime"],
            actors_data=raw["actors"],
            scenarios_data=raw["scenarios"],
            signal_data=raw["signal"],
            symbol="SPY",
        )

        summary = (
            f"Simulation complete — regime={output.regime.regime}, "
            f"{len(output.actors)} actors, {len(output.scenarios)} scenarios, "
            f"signal={output.signal.bias}"
        )
        mark_simulation_completed(run_uuid, summary)

        log.info("Task run_simulation completed: %s", summary)
        return {"status": "completed", "summary": summary, "db_run_id": db_run_id}

    except Exception as exc:
        error_msg = f"{exc}\n{traceback.format_exc()}"
        mark_simulation_failed(run_uuid, str(exc))
        log.exception("Task run_simulation failed: db_run_id=%s", db_run_id)
        raise


def run_replay(
    db_run_id: str,
    *,
    start_date: str,
    end_date: str,
    seed: int | None = None,
) -> dict:
    """Execute a replay generation job. Called by RQ worker."""
    setup_logging()
    log.info("Task run_replay started: db_run_id=%s (%s to %s)", db_run_id, start_date, end_date)

    from worker.persistence import (
        mark_replay_completed,
        mark_replay_failed,
        persist_replay_frame,
    )
    from worker.services.replay_service import generate_date_range, generate_single_frame

    run_uuid = uuid.UUID(db_run_id)

    try:
        if start_date == end_date:
            frame = generate_single_frame(start_date, seed=seed)
            frame_dict = frame.model_dump(mode="python")
            persist_replay_frame(run_uuid, frame_dict)
            frame_count = 1
        else:
            frames = generate_date_range(start_date, end_date, seed=seed)
            for frame in frames:
                frame_dict = frame.model_dump(mode="python")
                persist_replay_frame(run_uuid, frame_dict)
            frame_count = len(frames)

        summary = f"Replay {start_date}→{end_date}: {frame_count} frames generated"
        mark_replay_completed(run_uuid, summary, frame_count)

        log.info("Task run_replay completed: %s", summary)
        return {"status": "completed", "summary": summary, "db_run_id": db_run_id}

    except Exception as exc:
        mark_replay_failed(run_uuid, str(exc))
        log.exception("Task run_replay failed: db_run_id=%s", db_run_id)
        raise


def run_calibration(
    db_run_id: str,
    *,
    period_name: str | None = None,
    start_date: str = "2020-01-01",
    end_date: str = "2020-12-31",
) -> dict:
    """Execute a calibration job. Called by RQ worker."""
    setup_logging()
    log.info("Task run_calibration started: db_run_id=%s", db_run_id)

    from worker.persistence import mark_calibration_completed, mark_calibration_failed

    run_uuid = uuid.UUID(db_run_id)

    try:
        from datetime import date, timedelta

        from worker.data_providers.yahoo import YahooFinanceProvider
        from worker.engine.calibration import BENCHMARK_PERIODS, evaluate_replay_frames
        from worker.engine.historical_replay import replay_date_range

        provider = YahooFinanceProvider()

        if period_name:
            periods = [p for p in BENCHMARK_PERIODS if p["name"] == period_name]
        else:
            periods = BENCHMARK_PERIODS[:1]

        results = []
        for period in periods:
            frames = replay_date_range(provider, period["start"], period["end"])
            if not frames:
                continue

            fetch_start = date.fromisoformat(period["start"]) - timedelta(days=30)
            fetch_end = date.fromisoformat(period["end"]) + timedelta(days=30)
            spy_data = provider.fetch_ohlcv("SPY", fetch_start, fetch_end)

            result = evaluate_replay_frames(
                frames, spy_data, period["name"], period.get("expected_regimes", [])
            )
            results.append(result)

        if results:
            metrics = {
                "periods": [
                    {
                        "name": r.period_name,
                        "frames": r.total_frames,
                        "regime_match_rate": r.regime_match_rate,
                        "max_drawdown": r.max_drawdown,
                        "summary": r.summary,
                    }
                    for r in results
                ]
            }
            summary = f"Calibration complete — {len(results)} periods evaluated"
        else:
            metrics = {}
            summary = "Calibration complete — no benchmark data available"

        mark_calibration_completed(run_uuid, summary, metrics)

        log.info("Task run_calibration completed: %s", summary)
        return {"status": "completed", "summary": summary, "db_run_id": db_run_id}

    except Exception as exc:
        mark_calibration_failed(run_uuid, str(exc))
        log.exception("Task run_calibration failed: db_run_id=%s", db_run_id)
        raise


def run_data_refresh(db_run_id: str) -> dict:
    """Execute a market data refresh job. Called by RQ worker."""
    setup_logging()
    log.info("Task run_data_refresh started: db_run_id=%s", db_run_id)

    from worker.persistence import mark_simulation_completed, mark_simulation_failed, mark_simulation_running

    run_uuid = uuid.UUID(db_run_id)
    mark_simulation_running(run_uuid)

    try:
        from datetime import date

        from worker.data_providers.yahoo import YahooFinanceProvider

        provider = YahooFinanceProvider()
        symbols = ["SPY", "QQQ", "TLT", "VIX", "NVDA"]
        start = date(2020, 1, 1)
        end = date.today()

        data = provider.fetch_multi(symbols, start, end)
        summary = f"Data refresh complete — {len(data)} symbols updated"

        # Update system status with last data refresh
        from worker.persistence import _update_data_refresh_time
        _update_data_refresh_time()

        mark_simulation_completed(run_uuid, summary)

        log.info("Task run_data_refresh completed: %s", summary)
        return {"status": "completed", "summary": summary, "db_run_id": db_run_id}

    except Exception as exc:
        mark_simulation_failed(run_uuid, str(exc))
        log.exception("Task run_data_refresh failed: db_run_id=%s", db_run_id)
        raise
