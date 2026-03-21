"""Actor state service — powered by the SimuAlpha simulation engine."""

from app.schemas.actors import ActorStateResponse
from app.services.engine_bridge import get_current_simulation


class ActorService:
    def get_current(self) -> ActorStateResponse:
        return get_current_simulation().actors


actor_service = ActorService()
