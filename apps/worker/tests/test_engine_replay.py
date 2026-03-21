"""Tests for the replay engine."""

from __future__ import annotations

import random

from worker.engine.replay_engine import generate_replay_frame, generate_replay_range


class TestReplayEngine:
    def test_frame_has_required_fields(self):
        rng = random.Random(42)
        frame = generate_replay_frame(rng, "2025-03-18")
        assert frame.date == "2025-03-18"
        assert frame.regime in (
            "trend_up", "trend_down", "chop", "squeeze",
            "macro_risk_on", "macro_risk_off", "fragile_uptrend", "unstable_rally",
        )
        assert 0.30 <= frame.regime_confidence <= 0.95
        assert -1 <= frame.net_pressure <= 1
        assert len(frame.actor_states) == 4
        assert len(frame.scenario_branches) == 4
        assert frame.notes

    def test_realized_outcome_present(self):
        rng = random.Random(42)
        frame = generate_replay_frame(rng, "2025-03-18", include_outcome=True)
        assert frame.realized_outcome is not None

    def test_realized_outcome_absent(self):
        rng = random.Random(42)
        frame = generate_replay_frame(rng, "2025-03-18", include_outcome=False)
        assert frame.realized_outcome is None

    def test_actors_have_real_rationale(self):
        """Actor recent_change should come from real engine rationale, not random."""
        rng = random.Random(42)
        frame = generate_replay_frame(rng, "2025-03-18")
        for actor in frame.actor_states:
            # recent_change is first 120 chars of agent rationale
            assert len(actor.recent_change) > 10
            assert actor.archetype in ("trend_follower", "mean_reverter", "options_dealer", "macro_reactive")


class TestReplayRange:
    def test_generates_correct_count(self):
        frames = generate_replay_range(42, "2025-03-17", "2025-03-21")
        assert len(frames) == 5  # Mon-Fri

    def test_skips_weekends(self):
        frames = generate_replay_range(42, "2025-03-17", "2025-03-23")
        dates = [f.date for f in frames]
        assert "2025-03-22" not in dates  # Saturday
        assert "2025-03-23" not in dates  # Sunday
        assert len(frames) == 5

    def test_last_frame_has_no_outcome(self):
        frames = generate_replay_range(42, "2025-03-17", "2025-03-21")
        assert frames[-1].realized_outcome is None
        # Earlier frames should have outcomes
        assert frames[0].realized_outcome is not None

    def test_deterministic_range(self):
        f1 = generate_replay_range(42, "2025-03-17", "2025-03-19")
        f2 = generate_replay_range(42, "2025-03-17", "2025-03-19")
        for a, b in zip(f1, f2):
            assert a.regime == b.regime
            assert a.regime_confidence == b.regime_confidence
