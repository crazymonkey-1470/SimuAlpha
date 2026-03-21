"""Replay service — DB-first with engine fallback."""

import os

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.data.seed import REPLAY_FRAMES
from app.repositories.replay import replay_repo
from app.schemas.replay import ReplayFrame


class ReplayService:
    def get_frame(self, date: str, db: Session | None = None) -> ReplayFrame:
        # Try DB first
        if db is not None:
            record = replay_repo.get_frame_by_date(db, "SPY", date)
            if record:
                payload = record.snapshot_payload or {}
                return ReplayFrame(
                    date=record.frame_date,
                    regime=record.regime,
                    regime_confidence=record.regime_confidence,
                    net_pressure=record.net_pressure,
                    actor_states=payload.get("actor_states", []),
                    scenario_branches=payload.get("scenario_branches", []),
                    realized_outcome=record.realized_outcome,
                    notes=record.notes or "",
                )

        # Try real data replay
        use_real = os.environ.get("SIMUALPHA_USE_REAL_DATA", "false").lower() == "true"
        if use_real:
            frame = self._try_real_replay(date)
            if frame is not None:
                return frame

        # Try seed data
        frame_data = REPLAY_FRAMES.get(date)
        if frame_data is not None:
            return ReplayFrame(**frame_data)

        return self._synthetic_replay(date)

    def _try_real_replay(self, date: str) -> ReplayFrame | None:
        try:
            from worker.data_providers.yahoo import YahooFinanceProvider
            from worker.engine.historical_replay import replay_single_date

            provider = YahooFinanceProvider()
            engine_frame = replay_single_date(provider, date)
            if engine_frame is None:
                return None
            return ReplayFrame(**engine_frame.model_dump())
        except Exception:
            return None

    def _synthetic_replay(self, date: str) -> ReplayFrame:
        try:
            import random

            from worker.engine.replay_engine import generate_replay_frame

            date_seed = sum(ord(c) * (i + 1) for i, c in enumerate(date))
            rng = random.Random(date_seed)
            engine_frame = generate_replay_frame(rng, date)
            return ReplayFrame(**engine_frame.model_dump())
        except Exception:
            raise NotFoundError(f"No replay data available for {date}")


replay_service = ReplayService()
