"""Simulation orchestration service.

Coordinates all generators to produce a complete current-state
simulation payload. This is the primary entry point for simulation
runs.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone

from worker.core.config import get_settings
from worker.core.logging import get_logger
from worker.generators.actor_generator import generate_actors
from worker.generators.context_generator import generate_cross_asset
from worker.generators.regime_generator import generate_regime
from worker.generators.scenario_generator import generate_scenarios
from worker.generators.signal_generator import generate_signal
from worker.schemas.system import SimulationOutput

log = get_logger("svc.simulation")


def run_simulation(seed: int | None = None) -> SimulationOutput:
    """Execute a full simulation run and return the output payload.

    Parameters
    ----------
    seed : int | None
        Fixed seed for reproducibility. If None, uses the global config
        seed or falls back to a random seed.
    """
    settings = get_settings()
    effective_seed = seed if seed is not None else settings.seed
    rng = random.Random(effective_seed)

    ts = datetime.now(timezone.utc)
    log.info("Starting simulation (seed=%s, model=%s)", effective_seed, settings.model_version)

    regime = generate_regime(rng, ts)
    actors = generate_actors(rng)
    scenarios, base_case_id = generate_scenarios(rng)
    signal = generate_signal(rng, ts)
    cross_asset, as_of = generate_cross_asset(rng, ts)

    output = SimulationOutput(
        run_id="",  # filled in by job layer
        timestamp=ts,
        regime=regime,
        actors=actors,
        scenarios=scenarios,
        base_case_id=base_case_id,
        signal=signal,
        cross_asset=cross_asset,
        cross_asset_as_of=as_of,
    )

    log.info(
        "Simulation complete — regime=%s, %d actors, %d scenarios, signal=%s",
        regime.regime,
        len(actors),
        len(scenarios),
        signal.bias,
    )
    return output
