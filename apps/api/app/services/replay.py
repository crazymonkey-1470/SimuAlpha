"""Replay and backtest inspection service.

Currently returns seeded replay frames. When the simulation engine and
data store are integrated, this service will retrieve historical snapshots
from the time-series store.
"""

from app.core.exceptions import NotFoundError
from app.data.seed import REPLAY_FRAMES
from app.schemas.replay import ReplayFrame


class ReplayService:
    def get_frame(self, date: str) -> ReplayFrame:
        frame = REPLAY_FRAMES.get(date)
        if frame is None:
            raise NotFoundError(f"No replay data available for {date}")
        return ReplayFrame(**frame)


replay_service = ReplayService()
