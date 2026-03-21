"""Top-level simulation orchestrator.

This is the primary entry point for running the SimuAlpha simulation engine.
It coordinates market state generation, agent evaluation, aggregation,
regime classification, scenario branching, and signal generation.

Supports two modes:
- Synthetic (seeded random): for testing and when no market data available
- Real data: builds MarketState from actual historical market data

Produces a complete SimulationResult that can be:
- Returned to the API
- Logged for dev inspection
- Persisted to storage
"""

from __future__ import annotations

import random
from datetime import date, datetime, timedelta, timezone

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
    data_mode: str = Field(default="synthetic", description="'synthetic' or 'real'")

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
    use_real_data: bool = False,
) -> SimulationResult:
    """Run a complete current-state simulation.

    Parameters
    ----------
    seed : int | None
        Fixed seed for reproducibility (synthetic mode). Falls back to config seed.
    prior_signal : SignalSummary | None
        Previous signal for computing change_vs_prior.
    use_real_data : bool
        If True, fetch real market data and build features. Falls back to
        synthetic if data fetch fails.
    """
    settings = get_settings()
    ts = datetime.now(timezone.utc)
    data_mode = "synthetic"
    snapshot: MarketSnapshot | None = None

    if use_real_data:
        snapshot = _try_real_data_snapshot(ts)
        if snapshot is not None:
            data_mode = "real"
            log.info("Using real market data (%d instruments)", len(snapshot.states))

    if snapshot is None:
        effective_seed = seed if seed is not None else settings.seed
        rng = random.Random(effective_seed)
        log.info("Starting simulation engine (seed=%s, model=%s)", effective_seed, settings.model_version)
        snapshot = generate_synthetic_snapshot(rng, ts=ts)
        log.info("Market state generated for %d instruments (synthetic)", len(snapshot.states))

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
        seed=seed if seed is not None else (get_settings().seed),
        data_mode=data_mode,
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


def _try_real_data_snapshot(ts: datetime) -> MarketSnapshot | None:
    """Attempt to build a MarketSnapshot from real market data."""
    try:
        from worker.data_providers.yahoo import YahooFinanceProvider
        from worker.engine.features import build_snapshot_for_date, compute_features

        provider = YahooFinanceProvider()
        today = date.today()
        start = today - timedelta(days=180)
        symbols = ["SPY", "QQQ", "TLT", "VIX", "NVDA"]
        raw = provider.fetch_multi(symbols, start, today)

        feature_data = {}
        for sym, df in raw.items():
            feature_data[sym] = compute_features(df, sym)

        # Try today, then yesterday, then day before (in case market is closed)
        for offset in range(4):
            target = today - timedelta(days=offset)
            snapshot = build_snapshot_for_date(feature_data, target.isoformat())
            if snapshot is not None:
                return snapshot

        return None
    except Exception as exc:
        log.warning("Real data fetch failed, falling back to synthetic: %s", exc)
        return None
