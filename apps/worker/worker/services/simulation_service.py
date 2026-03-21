"""Simulation orchestration service.

Thin wrapper around the engine's run_current_simulation().
Converts engine SimulationResult → API-compatible SimulationOutput.
"""

from __future__ import annotations

from worker.core.logging import get_logger
from worker.engine.simulation import SimulationResult, run_current_simulation
from worker.schemas.system import SimulationOutput

log = get_logger("svc.simulation")


def run_simulation(seed: int | None = None) -> SimulationOutput:
    """Execute a full simulation run and return the API-compatible output payload."""
    result = run_current_simulation(seed=seed)
    return _to_simulation_output(result)


def _to_simulation_output(result: SimulationResult) -> SimulationOutput:
    """Convert engine result to API-compatible SimulationOutput."""
    return SimulationOutput(
        run_id="",  # filled by job layer
        timestamp=result.timestamp,
        regime=result.regime,
        actors=result.actors,
        scenarios=result.scenarios,
        base_case_id=result.base_case_id,
        signal=result.signal,
        cross_asset=result.cross_asset,
        cross_asset_as_of=result.cross_asset_as_of,
    )
