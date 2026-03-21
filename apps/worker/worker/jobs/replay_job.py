"""Replay generation job.

Generates historical replay frames for a given date or range
and tracks the run through the job registry.
"""

from __future__ import annotations

import json
from pathlib import Path

from worker.core.config import get_settings
from worker.core.logging import get_logger
from worker.schemas.system import JobType
from worker.services.job_registry import create_run, mark_completed, mark_failed, mark_running
from worker.services.replay_service import generate_date_range, generate_single_frame

log = get_logger("job.replay")


def execute_single(date: str, seed: int | None = None) -> str:
    """Generate a single replay frame and return the run_id."""
    run = create_run(JobType.REPLAY)
    run_id = run.run_id

    try:
        mark_running(run_id)
        frame = generate_single_frame(date, seed=seed)

        _emit_frame(run_id, date, frame)

        summary = f"Replay frame for {date} — regime={frame.regime}, {len(frame.actor_states)} actors"
        mark_completed(run_id, summary)

    except Exception as exc:
        mark_failed(run_id, str(exc))
        log.exception("Replay job %s failed", run_id)
        raise

    return run_id


def execute_range(start: str, end: str, seed: int | None = None) -> str:
    """Generate replay frames for a date range and return the run_id."""
    run = create_run(JobType.REPLAY)
    run_id = run.run_id

    try:
        mark_running(run_id)
        frames = generate_date_range(start, end, seed=seed)

        settings = get_settings()
        if settings.output_mode == "json":
            out_dir = Path(settings.output_dir) / "replay"
            out_dir.mkdir(parents=True, exist_ok=True)
            for frame in frames:
                path = out_dir / f"{run_id}_{frame.date}.json"
                path.write_text(frame.model_dump_json(indent=2))
            log.info("Wrote %d replay frames to %s", len(frames), out_dir)
        else:
            for frame in frames:
                log.info(
                    "  Replay %s: regime=%s conf=%.2f actors=%d scenarios=%d outcome=%s",
                    frame.date,
                    frame.regime,
                    frame.regime_confidence,
                    len(frame.actor_states),
                    len(frame.scenario_branches),
                    "yes" if frame.realized_outcome else "no",
                )

        summary = f"Replay range {start}→{end}: {len(frames)} frames generated"
        mark_completed(run_id, summary)

    except Exception as exc:
        mark_failed(run_id, str(exc))
        log.exception("Replay job %s failed", run_id)
        raise

    return run_id


def _emit_frame(run_id: str, date: str, frame) -> None:
    settings = get_settings()
    if settings.output_mode == "json":
        out_dir = Path(settings.output_dir) / "replay"
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{run_id}_{date}.json"
        path.write_text(frame.model_dump_json(indent=2))
        log.info("Output written to %s", path)
    else:
        log.info("─── Replay Frame [%s] %s ───", run_id, date)
        log.info("Regime: %s (conf=%.2f)", frame.regime, frame.regime_confidence)
        log.info("Actors: %d | Scenarios: %d", len(frame.actor_states), len(frame.scenario_branches))
        if frame.realized_outcome:
            log.info("Outcome: %s", frame.realized_outcome)
        log.info("─── End [%s] ───", run_id)
