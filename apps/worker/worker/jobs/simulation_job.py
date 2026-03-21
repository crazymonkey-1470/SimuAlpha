"""Simulation job.

Runs a full simulation cycle and tracks it through the job registry.
This is the primary job type for the worker service.
"""

from __future__ import annotations

import json
from pathlib import Path

from worker.core.config import get_settings
from worker.core.logging import get_logger
from worker.schemas.system import JobType
from worker.services.job_registry import create_run, mark_completed, mark_failed, mark_running
from worker.services.simulation_service import run_simulation

log = get_logger("job.simulation")


def execute(seed: int | None = None, use_real_data: bool = False) -> str:
    """Execute a simulation job and return the run_id."""
    run = create_run(JobType.SIMULATION)
    run_id = run.run_id

    try:
        mark_running(run_id)
        output = run_simulation(seed=seed, use_real_data=use_real_data)
        output.run_id = run_id

        _emit_output(run_id, output)

        summary = (
            f"Simulation complete — regime={output.regime.regime}, "
            f"{len(output.actors)} actors, {len(output.scenarios)} scenarios, "
            f"signal={output.signal.bias}"
        )
        mark_completed(run_id, summary)

    except Exception as exc:
        mark_failed(run_id, str(exc))
        log.exception("Simulation job %s failed", run_id)
        raise

    return run_id


def _emit_output(run_id: str, output: "SimulationOutput") -> None:
    """Write simulation output based on configured output mode."""
    settings = get_settings()

    if settings.output_mode == "json":
        out_dir = Path(settings.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{run_id}.json"
        path.write_text(output.model_dump_json(indent=2))
        log.info("Output written to %s", path)
    else:
        # Log mode — structured summary to stdout
        log.info("─── Simulation Output [%s] ───", run_id)
        log.info("Regime: %s (conf=%.2f, pressure=%.2f)", output.regime.regime, output.regime.confidence, output.regime.net_pressure)
        log.info("Signal: %s (conf=%.2f, horizon=%s)", output.signal.bias, output.signal.confidence, output.signal.time_horizon)
        for actor in output.actors:
            log.info("  Actor: %-30s bias=%-8s conv=%.2f contrib=%+.2f", actor.name, actor.bias, actor.conviction, actor.contribution)
        for scenario in output.scenarios:
            log.info("  Scenario: %-45s prob=%.0f%% dir=%s risk=%s", scenario.name, scenario.probability * 100, scenario.direction, scenario.risk_level)
        log.info("─── End [%s] ───", run_id)
