"""Tests for the SimuAlpha simulation engine core components."""

from __future__ import annotations

import random
from datetime import datetime, timezone

from worker.engine.agents.dealer_proxy import DealerProxyAgent
from worker.engine.agents.macro_news import MacroNewsAgent
from worker.engine.agents.mean_reversion import MeanReversionAgent
from worker.engine.agents.trend_follower import TrendFollowerAgent
from worker.engine.aggregator import aggregate_actors
from worker.engine.market_state import (
    MarketSnapshot,
    VolatilityRegime,
    generate_synthetic_snapshot,
)
from worker.engine.regime_engine import classify_regime
from worker.engine.scenario_engine import generate_scenarios
from worker.engine.signal_engine import generate_signal
from worker.engine.simulation import run_current_simulation


class TestMarketState:
    def test_synthetic_snapshot_has_all_instruments(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        assert set(snap.states.keys()) == {"SPY", "QQQ", "TLT", "VIX", "NVDA"}

    def test_primary_is_spy(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        assert snap.primary.instrument == "SPY"

    def test_deterministic(self):
        s1 = generate_synthetic_snapshot(random.Random(42))
        s2 = generate_synthetic_snapshot(random.Random(42))
        assert s1.primary.price == s2.primary.price
        assert s1.primary.trend_strength == s2.primary.trend_strength

    def test_different_seeds_differ(self):
        s1 = generate_synthetic_snapshot(random.Random(42))
        s2 = generate_synthetic_snapshot(random.Random(99))
        # With overwhelming probability at least one field differs
        assert s1.primary.price != s2.primary.price or s1.primary.return_1d != s2.primary.return_1d

    def test_fields_in_valid_ranges(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        spy = snap.primary
        assert -1 <= spy.breadth_proxy <= 1
        assert -1 <= spy.momentum_score <= 1
        assert -1 <= spy.mean_reversion_score <= 1
        assert -1 <= spy.trend_strength <= 1
        assert -1 <= spy.sentiment_score <= 1
        assert -1 <= spy.dealer_support_proxy <= 1
        assert 0 <= spy.macro_event_risk <= 1
        assert 0 <= spy.gap_risk <= 1
        assert spy.realized_vol >= 0
        assert spy.volatility_regime in VolatilityRegime

    def test_day_offset_changes_state(self):
        rng1 = random.Random(42)
        rng2 = random.Random(42)
        s1 = generate_synthetic_snapshot(rng1, day_offset=0)
        s2 = generate_synthetic_snapshot(rng2, day_offset=10)
        # Different days should produce different states
        assert s1.primary.trend_strength != s2.primary.trend_strength


class TestTrendFollowerAgent:
    def test_produces_valid_output(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        agent = TrendFollowerAgent()
        out = agent.evaluate(snap)
        assert out.archetype == "trend_follower"
        assert out.bias in ("bullish", "bearish", "neutral")
        assert 0 <= out.conviction <= 1
        assert -1 <= out.contribution <= 1
        assert 0 <= out.confidence <= 1
        assert len(out.rationale) > 20

    def test_reacts_to_trend(self):
        """Agent should be more bullish when trend is strong positive."""
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        agent = TrendFollowerAgent()

        # Patch trend strength to strongly positive
        spy = snap.states["SPY"]
        spy_dict = spy.model_dump()
        spy_dict["trend_strength"] = 0.8
        spy_dict["momentum_score"] = 0.7
        spy_dict["return_20d"] = 0.04
        from worker.engine.market_state import MarketState
        snap.states["SPY"] = MarketState(**spy_dict)

        out = agent.evaluate(snap)
        assert out.bias == "bullish"
        assert out.conviction > 0.3


class TestMeanReversionAgent:
    def test_produces_valid_output(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        agent = MeanReversionAgent()
        out = agent.evaluate(snap)
        assert out.archetype == "mean_reverter"
        assert out.bias in ("bullish", "bearish", "neutral")
        assert 0 <= out.conviction <= 1
        assert len(out.rationale) > 10


class TestDealerProxyAgent:
    def test_produces_valid_output(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        agent = DealerProxyAgent()
        out = agent.evaluate(snap)
        assert out.archetype == "options_dealer"
        assert out.bias == "neutral"  # Dealers are always neutral bias
        assert 0 <= out.conviction <= 1
        assert len(out.rationale) > 10


class TestMacroNewsAgent:
    def test_produces_valid_output(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        agent = MacroNewsAgent()
        out = agent.evaluate(snap)
        assert out.archetype == "macro_reactive"
        assert out.bias in ("bullish", "bearish", "neutral")
        assert 0 <= out.conviction <= 1
        assert len(out.rationale) > 10


class TestAggregator:
    def test_aggregates_multiple_agents(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        agents = [TrendFollowerAgent(), MeanReversionAgent(), DealerProxyAgent(), MacroNewsAgent()]
        outputs = [a.evaluate(snap) for a in agents]
        agg = aggregate_actors(outputs)

        assert -1 <= agg.net_pressure <= 1
        assert 0 <= agg.agreement_score <= 1
        assert 0 <= agg.fragility_score <= 1
        assert agg.bullish_count + agg.bearish_count + agg.neutral_count == 4
        assert agg.dominant_actor in ("trend_follower", "mean_reverter", "options_dealer", "macro_reactive")
        assert len(agg.actor_outputs) == 4

    def test_empty_outputs(self):
        agg = aggregate_actors([])
        assert agg.net_pressure == 0.0
        assert agg.dominant_actor == "none"


class TestRegimeEngine:
    def test_classifies_regime(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        agents = [TrendFollowerAgent(), MeanReversionAgent(), DealerProxyAgent(), MacroNewsAgent()]
        outputs = [a.evaluate(snap) for a in agents]
        agg = aggregate_actors(outputs)

        regime = classify_regime(snap, agg)
        assert regime.regime in (
            "trend_up", "trend_down", "chop", "squeeze",
            "macro_risk_on", "macro_risk_off", "fragile_uptrend", "unstable_rally",
        )
        assert 0.30 <= regime.confidence <= 0.95
        assert -1 <= regime.net_pressure <= 1
        assert len(regime.drivers) > 0
        assert len(regime.posture) > 10
        assert len(regime.summary) > 30

    def test_risk_flags_are_strings(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        agents = [TrendFollowerAgent(), MeanReversionAgent(), DealerProxyAgent(), MacroNewsAgent()]
        outputs = [a.evaluate(snap) for a in agents]
        agg = aggregate_actors(outputs)
        regime = classify_regime(snap, agg)
        for flag in regime.risk_flags:
            assert isinstance(flag, str)


class TestScenarioEngine:
    def test_generates_four_scenarios(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        agents = [TrendFollowerAgent(), MeanReversionAgent(), DealerProxyAgent(), MacroNewsAgent()]
        outputs = [a.evaluate(snap) for a in agents]
        agg = aggregate_actors(outputs)
        regime = classify_regime(snap, agg)

        scenarios, base_id = generate_scenarios(snap, agg, regime.regime)
        assert len(scenarios) == 4
        assert base_id == "scenario-base-case"

    def test_probabilities_roughly_sum_to_one(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        agents = [TrendFollowerAgent(), MeanReversionAgent(), DealerProxyAgent(), MacroNewsAgent()]
        outputs = [a.evaluate(snap) for a in agents]
        agg = aggregate_actors(outputs)
        regime = classify_regime(snap, agg)

        scenarios, _ = generate_scenarios(snap, agg, regime.regime)
        total = sum(s.probability for s in scenarios)
        assert abs(total - 1.0) < 0.05

    def test_scenario_ids_are_unique(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        agents = [TrendFollowerAgent(), MeanReversionAgent(), DealerProxyAgent(), MacroNewsAgent()]
        outputs = [a.evaluate(snap) for a in agents]
        agg = aggregate_actors(outputs)
        regime = classify_regime(snap, agg)

        scenarios, _ = generate_scenarios(snap, agg, regime.regime)
        ids = [s.id for s in scenarios]
        assert len(ids) == len(set(ids))


class TestSignalEngine:
    def test_generates_valid_signal(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        agents = [TrendFollowerAgent(), MeanReversionAgent(), DealerProxyAgent(), MacroNewsAgent()]
        outputs = [a.evaluate(snap) for a in agents]
        agg = aggregate_actors(outputs)
        regime = classify_regime(snap, agg)

        signal = generate_signal(snap, agg, regime.regime, regime.confidence)
        assert signal.bias in ("bullish", "mildly bullish", "neutral", "mildly bearish", "bearish")
        assert 0.25 <= signal.confidence <= 0.90
        assert len(signal.time_horizon) > 0
        assert len(signal.suggested_posture) > 10
        assert len(signal.change_vs_prior) > 0

    def test_change_vs_prior_with_previous_signal(self):
        rng = random.Random(42)
        snap = generate_synthetic_snapshot(rng)
        agents = [TrendFollowerAgent(), MeanReversionAgent(), DealerProxyAgent(), MacroNewsAgent()]
        outputs = [a.evaluate(snap) for a in agents]
        agg = aggregate_actors(outputs)
        regime = classify_regime(snap, agg)

        prior = generate_signal(snap, agg, regime.regime, regime.confidence)
        current = generate_signal(snap, agg, regime.regime, regime.confidence, prior_signal=prior)
        assert "Bias" in current.change_vs_prior
        assert "Confidence" in current.change_vs_prior


class TestFullSimulation:
    def test_run_current_simulation(self):
        result = run_current_simulation(seed=42)
        assert result.regime.regime
        assert len(result.actors) == 4
        assert len(result.scenarios) == 4
        assert result.signal.bias
        assert len(result.cross_asset) == 5
        assert result.base_case_id == "scenario-base-case"
        assert result.aggregate.net_pressure is not None
        assert result.market_snapshot_summary

    def test_deterministic_simulation(self):
        r1 = run_current_simulation(seed=42)
        r2 = run_current_simulation(seed=42)
        assert r1.regime.regime == r2.regime.regime
        assert r1.regime.confidence == r2.regime.confidence
        assert r1.signal.bias == r2.signal.bias
        assert r1.aggregate.net_pressure == r2.aggregate.net_pressure
        for a1, a2 in zip(r1.actors, r2.actors):
            assert a1.conviction == a2.conviction

    def test_different_seeds_produce_different_output(self):
        r1 = run_current_simulation(seed=42)
        r2 = run_current_simulation(seed=999)
        # At least some fields should differ
        differs = (
            r1.regime.regime != r2.regime.regime
            or r1.signal.bias != r2.signal.bias
            or r1.aggregate.net_pressure != r2.aggregate.net_pressure
        )
        assert differs
