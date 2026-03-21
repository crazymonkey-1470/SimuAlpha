"""Replay and backtest inspection service — powered by the simulation engine.

Generates replay frames on-demand using the engine's replay generation.
Falls back to seed data for pre-existing hardcoded dates.
"""

from app.core.exceptions import NotFoundError
from app.data.seed import REPLAY_FRAMES
from app.schemas.replay import ReplayFrame


class ReplayService:
    def get_frame(self, date: str) -> ReplayFrame:
        # Try seed data first (backward compatible)
        frame_data = REPLAY_FRAMES.get(date)
        if frame_data is not None:
            return ReplayFrame(**frame_data)

        # Generate on-demand via the simulation engine
        try:
            import random

            from worker.engine.replay_engine import generate_replay_frame

            # Deterministic seed from date string
            date_seed = sum(ord(c) * (i + 1) for i, c in enumerate(date))
            rng = random.Random(date_seed)
            engine_frame = generate_replay_frame(rng, date)

            # Serialize through dict to cross the schema boundary
            return ReplayFrame(**engine_frame.model_dump())
        except Exception:
            raise NotFoundError(f"No replay data available for {date}")


replay_service = ReplayService()
