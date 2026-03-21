"""Scenario analysis service.

Currently returns seeded scenario branches. When the simulation engine is
integrated, scenarios will be generated from Monte Carlo path analysis and
actor-state projections.
"""

from app.data.seed import CURRENT_SCENARIOS
from app.schemas.scenarios import ScenarioResponse


class ScenarioService:
    def get_current(self) -> ScenarioResponse:
        return ScenarioResponse(**CURRENT_SCENARIOS)


scenario_service = ScenarioService()
