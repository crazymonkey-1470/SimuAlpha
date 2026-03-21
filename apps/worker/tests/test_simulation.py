"""Tests for simulation generation and deterministic seeded behavior."""

from __future__ import annotations

import random

from worker.generators.actor_generator import generate_actors
from worker.generators.context_generator import generate_cross_asset
from worker.generators.regime_generator import generate_regime, generate_regime_history
from worker.generators.scenario_generator import generate_scenarios
from worker.generators.signal_generator import generate_signal, generate_signal_history
from worker.services.simulation_service import run_simulation


class TestDeterministicSeeding:
    """Same seed should produce identical outputs."""

    def test_simulation_is_deterministic(self):
        out1 = run_simulation(seed=42)
        out2 = run_simulation(seed=42)
        assert out1.regime.regime == out2.regime.regime
        assert out1.regime.confidence == out2.regime.confidence
        assert out1.signal.bias == out2.signal.bias
        assert len(out1.actors) == len(out2.actors)
        for a1, a2 in zip(out1.actors, out2.actors):
            assert a1.id == a2.id
            assert a1.conviction == a2.conviction

    def test_different_seeds_differ(self):
        out1 = run_simulation(seed=42)
        out2 = run_simulation(seed=99)
        # With overwhelming probability these will differ
        differs = (
            out1.regime.regime != out2.regime.regime
            or out1.regime.confidence != out2.regime.confidence
            or out1.signal.bias != out2.signal.bias
        )
        assert differs


class TestRegimeGenerator:
    def test_regime_snapshot_fields(self):
        rng = random.Random(42)
        snap = generate_regime(rng)
        assert 0.0 <= snap.confidence <= 1.0
        assert -1.0 <= snap.net_pressure <= 1.0
        assert len(snap.drivers) > 0
        assert len(snap.risk_flags) > 0
        assert len(snap.summary) > 20
        assert snap.posture

    def test_regime_history(self):
        rng = random.Random(42)
        dates = ["2025-03-17", "2025-03-18", "2025-03-19", "2025-03-20", "2025-03-21"]
        history = generate_regime_history(rng, dates)
        assert len(history) == 5
        assert history[0].date == "2025-03-17"
        assert history[-1].date == "2025-03-21"


class TestActorGenerator:
    def test_generates_all_actors(self):
        rng = random.Random(42)
        actors = generate_actors(rng)
        assert len(actors) == 7
        archetypes = {a.archetype for a in actors}
        assert "trend_follower" in archetypes
        assert "panic_seller" in archetypes
        assert "options_dealer" in archetypes

    def test_actor_fields_valid(self):
        rng = random.Random(42)
        actors = generate_actors(rng)
        for actor in actors:
            assert 0.0 <= actor.conviction <= 1.0
            assert 0.0 <= actor.confidence <= 1.0
            assert -1.0 <= actor.contribution <= 1.0
            assert actor.bias in ("bullish", "bearish", "neutral")
            assert len(actor.sensitivities) > 0


class TestScenarioGenerator:
    def test_generates_four_scenarios(self):
        rng = random.Random(42)
        scenarios, base_id = generate_scenarios(rng)
        assert len(scenarios) == 4
        assert base_id == "scenario-base"

    def test_probabilities_sum_to_one(self):
        rng = random.Random(42)
        scenarios, _ = generate_scenarios(rng)
        total = sum(s.probability for s in scenarios)
        assert abs(total - 1.0) < 0.05  # allow rounding

    def test_scenario_fields_valid(self):
        rng = random.Random(42)
        scenarios, _ = generate_scenarios(rng)
        for s in scenarios:
            assert 0.0 <= s.probability <= 1.0
            assert s.risk_level in ("low", "moderate", "elevated", "high")
            assert len(s.drivers) > 0
            assert len(s.invalidation_conditions) > 0


class TestSignalGenerator:
    def test_signal_fields_valid(self):
        rng = random.Random(42)
        signal = generate_signal(rng)
        assert 0.0 <= signal.confidence <= 1.0
        assert signal.bias
        assert signal.time_horizon
        assert signal.suggested_posture
        assert len(signal.warnings) > 0
        assert signal.change_vs_prior

    def test_signal_history(self):
        rng = random.Random(42)
        dates = ["2025-03-17", "2025-03-18", "2025-03-19"]
        history = generate_signal_history(rng, dates)
        assert len(history) == 3


class TestContextGenerator:
    def test_cross_asset_generates_all_instruments(self):
        rng = random.Random(42)
        entries, as_of = generate_cross_asset(rng)
        assert len(entries) == 7
        instruments = {e.instrument for e in entries}
        assert "SPX" in instruments
        assert "VIX" in instruments
        assert as_of


class TestSimulationService:
    def test_full_simulation_output(self):
        output = run_simulation(seed=42)
        assert output.regime.regime
        assert len(output.actors) == 7
        assert len(output.scenarios) == 4
        assert output.signal.bias
        assert len(output.cross_asset) == 7
        assert output.base_case_id == "scenario-base"
