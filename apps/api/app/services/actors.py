"""Actor state service.

Currently returns seeded actor data. When the simulation engine is integrated,
this service will read computed actor states from the simulation output pipeline.
"""

from app.data.seed import CURRENT_ACTORS
from app.schemas.actors import ActorStateResponse


class ActorService:
    def get_current(self) -> ActorStateResponse:
        return ActorStateResponse(
            actors=CURRENT_ACTORS,
            actor_count=len(CURRENT_ACTORS),
        )


actor_service = ActorService()
