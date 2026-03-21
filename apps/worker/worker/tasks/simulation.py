"""Placeholder for simulation tasks.

Future simulation and market analysis tasks will be defined here.
Each task should be a callable that can be dispatched by the job runner.
"""

import logging

logger = logging.getLogger("simualpha.worker.tasks.simulation")


async def run_simulation(simulation_id: str) -> dict[str, str]:
    """Placeholder for running a market simulation."""
    logger.info("Running simulation %s", simulation_id)
    # Implementation will be added when simulation logic is built
    return {"simulation_id": simulation_id, "status": "not_implemented"}
