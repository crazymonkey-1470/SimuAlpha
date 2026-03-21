"""Top-level simulation orchestrator.

This is the primary entry point for running the SimuAlpha simulation engine.
It coordinates market state generation, agent evaluation, aggregation,
regime classification, scenario branching, and signal generation.

Produces a complete SimulationResult that can be:
- Returned to the API
- Logged for dev inspection
- Persisted to storage
"""

from __future__ import annotations

import random
from datetime import datetime, timezone

from pydantic import BaseModel, Field

from worker.core.config import get_settings
from worker.core.logging import get_logger
from worker.engine.agents.base import AgentOutput
from worker.engine.agents.dealer_proxy import DealerProxyAgent
from worker.engine.agents.macro_news import MacroNewsAgent
from worker.engine.agents.mean_reversion import MeanReversionAgent
from worker.engine.agents.trend_follower import TrendFollowerAgent
from worker.engine.aggregator import AggregateState, aggregate_actors
from worker.engine.market_state import MarketSnapshot, generate_synthetic_snapshot
from worker.engine.regime_engine import classify_regime
from worker.engine.scenario_engine import generate_scenarios
from worker.engine.signal_engine import generate_signal
from worker.schemas.actor import ActorSensitivity, ActorState
from worker.schemas.context import CrossAssetEntry
from worker.schemas.regime import RegimeSnapshot
from worker.schemas.scenario import ScenarioBranch
from worker.schemas.signal import SignalSummary

log = get_logger("engine.simulation")

# Instantiate agents once
_AGENTS = [
    TrendFollowerAgent(),
    MeanReversionAgent(),
    DealerProxyAgent(),
    MacroNewsAgent(),
]


class SimulationResult(BaseModel):
    """Complete output from a single simulation run."""

    timestamp: datetime
    seed: int | None = None

    # Core outputs
    regime: RegimeSnapshot
    actors: list[ActorState]
    scenarios: list[ScenarioBranch]
    base_case_id: str
    signal: SignalSummary
    cross_asset: list[CrossAssetEntry]
    cross_asset_as_of: str

    # Engine internals (useful for debugging/transparency)
    aggregate: AggregateState
    market_snapshot_summary: dict = Field(default_factory=dict, description="Summary of market state inputs")


def run_current_simulation(
    seed: int | None = None,
    prior_signal: SignalSummary | None = None,
) -> SimulationResult:
    """Run a complete current-state simulation.

    Parameters
    ----------
    seed : int | None
        Fixed seed for reproducibility. Falls back to config seed.
    prior_signal : SignalSummary | None
        Previous signal for computing change_vs_prior.
    """
    settings = get_settings()
    effective_seed = seed if seed is not None else settings.seed
    rng = random.Random(effective_seed)
    ts = datetime.now(timezone.utc)

    log.info("Starting simulation engine (seed=%s, model=%s)", effective_seed, settings.model_version)

    # 1. Generate market state
    snapshot = generate_synthetic_snapshot(rng, ts=ts)
    log.info("Market state generated for %d instruments", len(snapshot.states))

    # 2. Run all agents against the market state
    agent_outputs: list[AgentOutput] = []
    for agent in _AGENTS:
        output = agent.evaluate(snapshot)
        agent_outputs.append(output)
        log.info(
            "  Agent %-30s bias=%-8s conv=%.2f contrib=%+.2f conf=%.2f",
            output.agent_name, output.bias, output.conviction, output.contribution, output.confidence,
        )

    # 3. Aggregate actor outputs
    agg = aggregate_actors(agent_outputs)
    log.info(
        "Aggregate: pressure=%+.3f dominant=%s agreement=%.2f fragility=%.2f",
        agg.net_pressure, agg.dominant_actor, agg.agreement_score, agg.fragility_score,
    )

    # 4. Classify regime
    regime = classify_regime(snapshot, agg, ts=ts)
    log.info("Regime: %s (conf=%.2f)", regime.regime, regime.confidence)

    # 5. Generate scenarios
    scenarios, base_case_id = generate_scenarios(snapshot, agg, regime.regime)
    for s in scenarios:
        log.info("  Scenario %-45s prob=%.0f%% dir=%s", s.name, s.probability * 100, s.direction)

    # 6. Generate signal
    signal = generate_signal(snapshot, agg, regime.regime, regime.confidence, prior_signal, ts=ts)
    log.info("Signal: %s (conf=%.2f, posture=%s)", signal.bias, signal.confidence, signal.suggested_posture[:50])

    # 7. Build cross-asset context from market snapshot
    cross_asset = _build_cross_asset(snapshot)

    # 8. Convert agent outputs to API-compatible ActorState
    actors = [_to_actor_state(o) for o in agent_outputs]

    # 9. Market snapshot summary for transparency
    spy = snapshot.primary
    snapshot_summary = {
        "SPY_price": spy.price,
        "SPY_return_1d": spy.return_1d,
        "SPY_trend_strength": spy.trend_strength,
        "SPY_realized_vol": spy.realized_vol,
        "SPY_vol_regime": spy.volatility_regime.value,
        "SPY_macro_event_risk": spy.macro_event_risk,
        "SPY_dealer_support": spy.dealer_support_proxy,
        "SPY_breadth": spy.breadth_proxy,
        "SPY_sentiment": spy.sentiment_score,
    }

    result = SimulationResult(
        timestamp=ts,
        seed=effective_seed,
        regime=regime,
        actors=actors,
        scenarios=scenarios,
        base_case_id=base_case_id,
        signal=signal,
        cross_asset=cross_asset,
        cross_asset_as_of=ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        aggregate=agg,
        market_snapshot_summary=snapshot_summary,
    )

    log.info("Simulation complete.")
    return result


def _to_actor_state(o: AgentOutput) -> ActorState:
    """Convert engine AgentOutput to API-compatible ActorState."""
    return ActorState(
        id=o.agent_id,
        name=o.agent_name,
        archetype=o.archetype,
        bias=o.bias,
        conviction=o.conviction,
        contribution=o.contribution,
        horizon=o.horizon,
        sensitivities=[ActorSensitivity(factor=s["factor"], weight=s["weight"]) for s in o.sensitivities],
        recent_change=o.rationale[:150],
        confidence=o.confidence,
    )


def _build_cross_asset(snapshot: MarketSnapshot) -> list[CrossAssetEntry]:
    """Build cross-asset context from the market snapshot."""
    entries: list[CrossAssetEntry] = []
    for ticker, state in snapshot.states.items():
        entries.append(CrossAssetEntry(
            instrument=ticker,
            last_price=state.price,
            change_pct=round(state.return_1d * 100, 2),
            volatility_state=_vol_state_label(state.volatility_regime.value),
            trend_state=_trend_state_label(state.trend_strength),
            notes=_instrument_note(ticker, state),
        ))
    return entries


def _vol_state_label(regime_value: str) -> str:
    return {"compressed": "compressed", "normal": "normal", "elevated": "elevated", "extreme": "elevated"}.get(regime_value, "normal")


def _trend_state_label(trend_strength: float) -> str:
    if trend_strength > 0.2:
        return "uptrend"
    elif trend_strength < -0.2:
        return "downtrend"
    return "range-bound"


def _instrument_note(ticker: str, state) -> str:
    direction = "higher" if state.return_1d > 0 else "lower"
    vol_note = f"vol {state.volatility_regime.value}"
    trend_note = f"trend strength {state.trend_strength:+.2f}"
    return f"{ticker} {direction} ({state.return_1d:+.2%}); {vol_note}, {trend_note}"
