"""Scenario analysis service — powered by the SimuAlpha simulation engine."""

from app.schemas.scenarios import ScenarioResponse
from app.services.engine_bridge import get_current_simulation


class ScenarioService:
    def get_current(self) -> ScenarioResponse:
        return get_current_simulation().scenarios


scenario_service = ScenarioService()
