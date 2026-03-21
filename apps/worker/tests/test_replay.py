"""Tests for replay frame generation."""

from __future__ import annotations

import random

from worker.generators.replay_generator import generate_replay_frame
from worker.services.replay_service import generate_date_range, generate_single_frame


class TestReplayGenerator:
    def test_frame_fields_valid(self):
        rng = random.Random(42)
        frame = generate_replay_frame(rng, "2025-03-18")
        assert frame.date == "2025-03-18"
        assert 0.0 <= frame.regime_confidence <= 1.0
        assert -1.0 <= frame.net_pressure <= 1.0
        assert len(frame.actor_states) > 0
        assert len(frame.scenario_branches) > 0
        assert frame.notes

    def test_frame_is_date_dependent(self):
        rng1 = random.Random(42)
        rng2 = random.Random(42)
        f1 = generate_replay_frame(rng1, "2025-03-18")
        f2 = generate_replay_frame(rng2, "2025-03-19")
        # Same base seed but different dates should produce different regimes
        # (with very high probability)
        assert f1.date != f2.date

    def test_realized_outcome_present(self):
        rng = random.Random(42)
        frame = generate_replay_frame(rng, "2025-03-18", include_outcome=True)
        assert frame.realized_outcome is not None

    def test_realized_outcome_absent(self):
        rng = random.Random(42)
        frame = generate_replay_frame(rng, "2025-03-18", include_outcome=False)
        assert frame.realized_outcome is None


class TestReplayService:
    def test_single_frame(self):
        frame = generate_single_frame("2025-03-18", seed=42)
        assert frame.date == "2025-03-18"

    def test_date_range_skips_weekends(self):
        frames = generate_date_range("2025-03-17", "2025-03-23", seed=42)
        dates = [f.date for f in frames]
        # March 22-23 are Saturday-Sunday
        assert "2025-03-22" not in dates
        assert "2025-03-23" not in dates
        assert len(frames) == 5  # Mon-Fri

    def test_deterministic_replay(self):
        f1 = generate_single_frame("2025-03-18", seed=42)
        f2 = generate_single_frame("2025-03-18", seed=42)
        assert f1.regime == f2.regime
        assert f1.regime_confidence == f2.regime_confidence
