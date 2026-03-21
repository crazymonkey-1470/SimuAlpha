"""Calibration job — scaffold.

This job will handle model calibration when real market data and
backtesting infrastructure are connected. For now it is a placeholder
that demonstrates the job pattern.

Future implementation will:
- Load historical market data from Supabase
- Run parameter optimization against realized outcomes
- Update model weights and actor sensitivities
- Persist calibration artifacts
- Update system status with calibration timestamp
"""

from __future__ import annotations

from worker.core.logging import get_logger
from worker.schemas.system import JobType
from worker.services.job_registry import create_run, mark_completed, mark_running

log = get_logger("job.calibration")


def execute() -> str:
    """Execute a calibration job (scaffold — logs only)."""
    run = create_run(JobType.CALIBRATION)
    run_id = run.run_id

    mark_running(run_id)

    log.info("Calibration job %s started (scaffold — no real calibration yet)", run_id)
    log.info("  Future steps: load data → optimize parameters → persist artifacts")
    log.info("  Extend this module when backtesting infrastructure is ready.")

    mark_completed(
        run_id,
        "Calibration scaffold executed successfully (no real computation)",
        warnings=["Calibration logic not yet implemented — using baseline parameters"],
    )

    return run_id
