"""Bridge between the API layer and the SimuAlpha simulation engine.

Runs the engine on-demand and caches the result so that all /current
endpoints return consistent state from the same simulation run.

The cache is time-based: a new simulation runs if the cached result
is older than CACHE_TTL_SECONDS. In production, this will be replaced
by reading from a persistent store populated by the worker service.

Because the API and worker have separate Pydantic schema classes (same
fields, different types), this bridge serializes engine output to dicts
and reconstructs using API-side schemas.
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Any

from app.schemas.actors import ActorState, ActorStateResponse
from app.schemas.context import CrossAssetEntry, CrossAssetResponse
from app.schemas.regime import RegimeSnapshot
from app.schemas.scenarios import ScenarioResponse
from app.schemas.signals import SignalSummary

CACHE_TTL_SECONDS = int(os.environ.get("SIMUALPHA_SIM_CACHE_TTL", "300"))  # 5 min default


class SimulationSnapshot:
    """API-side representation of a simulation result."""

    def __init__(self, raw: dict[str, Any]):
        self._raw = raw
        self.regime = RegimeSnapshot(**raw["regime"])
        self.actors = ActorStateResponse(
            actors=[ActorState(**a) for a in raw["actors"]],
            actor_count=len(raw["actors"]),
        )
        self.scenarios = ScenarioResponse(
            scenarios=raw["scenarios"],
            base_case_id=raw["base_case_id"],
        )
        self.signal = SignalSummary(**raw["signal"])
        self.cross_asset = CrossAssetResponse(
            entries=[CrossAssetEntry(**e) for e in raw["cross_asset"]],
            as_of=raw["cross_asset_as_of"],
        )


_cached: SimulationSnapshot | None = None
_cached_at: float = 0.0


def get_current_simulation() -> SimulationSnapshot:
    """Return the current simulation snapshot, running the engine if cache is stale."""
    global _cached, _cached_at

    now = time.monotonic()
    if _cached is not None and (now - _cached_at) < CACHE_TTL_SECONDS:
        return _cached

    from worker.engine.simulation import run_current_simulation

    # Use a seed derived from current date for daily consistency
    today = datetime.now(timezone.utc)
    daily_seed = today.year * 10000 + today.month * 100 + today.day
    result = run_current_simulation(seed=daily_seed)

    # Serialize engine output to dicts, then reconstruct with API schemas
    raw = result.model_dump(mode="python")
    snapshot = SimulationSnapshot(raw)

    _cached = snapshot
    _cached_at = now
    return snapshot


def invalidate_cache() -> None:
    """Force a fresh simulation on next request."""
    global _cached, _cached_at
    _cached = None
    _cached_at = 0.0
