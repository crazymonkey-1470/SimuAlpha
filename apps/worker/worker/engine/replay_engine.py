"""Replay engine — generates historical-looking simulation frames.

Produces a time series of MarketSnapshots and corresponding simulation
outputs (regime, actors, scenarios, signals) for a range of dates.

The synthetic time series is deterministic from a seed, and each date
produces an internally consistent state that evolves plausibly over time.

When real historical data is available, replace generate_historical_series()
with a loader that reads from a market data store.
"""

from __future__ import annotations

import random
from datetime import date, datetime, timedelta, timezone

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
from worker.schemas.replay import ReplayFrame
from worker.schemas.scenario import ScenarioBranch
from worker.schemas.signal import SignalSummary


_AGENTS = [
    TrendFollowerAgent(),
    MeanReversionAgent(),
    DealerProxyAgent(),
    MacroNewsAgent(),
]

# Synthetic realized outcomes — selected based on next-day return direction
_OUTCOMES_UP = [
    "Market advanced {bps}bps on session; passive flows and short-covering dominated bid side. Realized outcome aligned with base case.",
    "Continuation pattern played out; breadth confirmed move. SPY gained {bps}bps with above-average volume.",
    "Dip buyers absorbed early weakness; market recovered to close higher by {bps}bps. Trend persistence intact.",
]

_OUTCOMES_DOWN = [
    "Market declined {bps}bps; dealer gamma flip amplified selling pressure. Realized vol expanded intraday.",
    "Risk-off rotation materialized; TLT rallied as equities sold off {bps}bps. Macro agents dominated flow.",
    "Choppy session resolved to downside; SPY closed lower by {bps}bps with declining breadth.",
]

_OUTCOMES_FLAT = [
    "Range-bound session with {bps}bps net change. No actor class achieved directional dominance.",
    "Low-volume consolidation; market moved {bps}bps with minimal conviction. Squeeze conditions persist.",
]


def generate_replay_frame(
    rng: random.Random,
    target_date: str,
    day_offset: int = 0,
    prior_signal: SignalSummary | None = None,
    include_outcome: bool = True,
) -> ReplayFrame:
    """Generate a single replay frame for a specific date."""
    ts = datetime.fromisoformat(f"{target_date}T16:30:00+00:00")

    # Generate market state for this day
    snapshot = generate_synthetic_snapshot(rng, ts=ts, day_offset=day_offset)

    # Run agents
    outputs = [agent.evaluate(snapshot) for agent in _AGENTS]
    agg = aggregate_actors(outputs)

    # Regime
    regime = classify_regime(snapshot, agg, ts=ts)

    # Scenarios
    scenarios, base_case_id = generate_scenarios(snapshot, agg, regime.regime)

    # Signal
    signal = generate_signal(snapshot, agg, regime.regime, regime.confidence, prior_signal, ts=ts)

    # Convert agent outputs to ActorState for API compatibility
    actor_states = [_agent_output_to_actor_state(o) for o in outputs]

    # Realized outcome (simulated)
    outcome: str | None = None
    if include_outcome:
        outcome = _generate_outcome(rng, snapshot)

    return ReplayFrame(
        date=target_date,
        regime=regime.regime,
        regime_confidence=regime.confidence,
        net_pressure=round(agg.net_pressure, 2),
        actor_states=actor_states,
        scenario_branches=scenarios,
        realized_outcome=outcome,
        notes=f"Simulation snapshot at {target_date} EOD. Regime={regime.regime} (conf={regime.confidence:.2f}). Signal={signal.bias}.",
    )


def generate_replay_range(
    seed: int,
    start: str,
    end: str,
) -> list[ReplayFrame]:
    """Generate replay frames for a date range (business days only)."""
    rng = random.Random(seed)
    start_date = date.fromisoformat(start)
    end_date = date.fromisoformat(end)

    dates: list[str] = []
    current = start_date
    while current <= end_date:
        if current.weekday() < 5:  # Skip weekends
            dates.append(current.isoformat())
        current += timedelta(days=1)

    frames: list[ReplayFrame] = []
    prior_signal: SignalSummary | None = None

    for i, d in enumerate(dates):
        # Last date in range doesn't get realized outcome (it's "today")
        include_outcome = (i < len(dates) - 1)
        frame = generate_replay_frame(rng, d, day_offset=i, prior_signal=prior_signal, include_outcome=include_outcome)

        # Extract signal for next iteration's change_vs_prior
        # Re-derive signal to pass forward (we already have it computed in the frame generation)
        ts = datetime.fromisoformat(f"{d}T16:30:00+00:00")
        snap = generate_synthetic_snapshot(random.Random(rng.randint(0, 2**31)), ts=ts, day_offset=i)
        outputs = [agent.evaluate(snap) for agent in _AGENTS]
        agg = aggregate_actors(outputs)
        regime = classify_regime(snap, agg, ts=ts)
        prior_signal = generate_signal(snap, agg, regime.regime, regime.confidence, prior_signal, ts=ts)

        frames.append(frame)

    return frames


def _agent_output_to_actor_state(o: AgentOutput) -> ActorState:
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
        recent_change=o.rationale[:120],  # Use rationale as recent_change (truncated)
        confidence=o.confidence,
    )


def _generate_outcome(rng: random.Random, snapshot: MarketSnapshot) -> str:
    """Generate a plausible realized outcome based on market state."""
    spy = snapshot.primary
    # Use next-day-like return to pick outcome direction
    # We simulate a small forward move correlated with current momentum
    forward_move = spy.momentum_score * 0.005 + rng.gauss(0, 0.008)
    bps = abs(round(forward_move * 10000))
    bps = max(3, min(120, bps))

    if forward_move > 0.002:
        template = rng.choice(_OUTCOMES_UP)
    elif forward_move < -0.002:
        template = rng.choice(_OUTCOMES_DOWN)
    else:
        template = rng.choice(_OUTCOMES_FLAT)

    return template.replace("{bps}", str(bps))
