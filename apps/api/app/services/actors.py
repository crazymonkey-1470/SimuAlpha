"""Actor state service — DB-first with engine fallback."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.repositories.actor import actor_repo
from app.schemas.actors import ActorSensitivity, ActorState, ActorStateResponse
from app.services.engine_bridge import get_current_simulation


class ActorService:
    def get_current(self, db: Session | None = None) -> ActorStateResponse:
        if db is not None:
            records = actor_repo.get_latest_by_symbol(db)
            if records:
                actors = [
                    ActorState(
                        id=str(r.id),
                        name=r.actor_name,
                        archetype=r.archetype,
                        bias=r.bias,
                        conviction=r.conviction,
                        contribution=r.contribution,
                        horizon=r.horizon,
                        sensitivities=[ActorSensitivity(**s) for s in (r.sensitivities or [])],
                        recent_change=r.recent_change or "",
                        confidence=r.confidence,
                    )
                    for r in records
                ]
                return ActorStateResponse(actors=actors, actor_count=len(actors))
        return get_current_simulation().actors


actor_service = ActorService()
