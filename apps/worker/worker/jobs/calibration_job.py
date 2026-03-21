"""Calibration job with database persistence."""

from __future__ import annotations

from worker.core.logging import get_logger
from worker.persistence import (
    create_calibration_run,
    mark_calibration_completed,
    mark_calibration_failed,
)
from worker.schemas.system import JobType
from worker.services.job_registry import create_run, mark_completed, mark_failed, mark_running

log = get_logger("job.calibration")


def execute(
    *,
    period_name: str | None = None,
    start_date: str = "2020-01-01",
    end_date: str = "2020-12-31",
) -> str:
    """Execute a calibration job and return the run_id."""
    run = create_run(JobType.CALIBRATION)
    run_id = run.run_id

    db_run_id = create_calibration_run(
        period_name=period_name, start_date=start_date, end_date=end_date
    )

    try:
        mark_running(run_id)

        log.info("Calibration job %s started (period=%s)", run_id, period_name or "default")

        # Run actual calibration if worker engine supports it
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
                summary = "Calibration scaffold — no real computation performed"

        except Exception:
            metrics = {}
            summary = "Calibration scaffold — engine modules not available"

        mark_completed(run_id, summary)
        if db_run_id:
            mark_calibration_completed(db_run_id, summary, metrics)

    except Exception as exc:
        mark_failed(run_id, str(exc))
        if db_run_id:
            mark_calibration_failed(db_run_id, str(exc))
        log.exception("Calibration job %s failed", run_id)
        raise

    return run_id
