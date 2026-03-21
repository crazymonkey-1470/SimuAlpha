"""Scenario analysis service — DB-first with engine fallback."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.repositories.scenario import scenario_repo
from app.schemas.scenarios import ActorReaction, ScenarioBranch, ScenarioResponse
from app.services.engine_bridge import get_current_simulation


class ScenarioService:
    def get_current(self, db: Session | None = None) -> ScenarioResponse:
        if db is not None:
            records = scenario_repo.get_latest_by_symbol(db)
            if records:
                scenarios = [
                    ScenarioBranch(
                        id=str(r.id),
                        name=r.branch_name,
                        probability=r.probability,
                        direction=r.direction,
                        drivers=r.drivers or [],
                        invalidation_conditions=r.invalidation_conditions or [],
                        actor_reactions=[ActorReaction(**ar) for ar in (r.actor_reactions or [])],
                        risk_level=r.risk_level,
                        notes=r.notes or "",
                    )
                    for r in records
                ]
                base_id = str(records[0].id) if records else ""
                return ScenarioResponse(scenarios=scenarios, base_case_id=base_id)
        return get_current_simulation().scenarios


scenario_service = ScenarioService()
