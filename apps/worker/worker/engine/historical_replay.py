"""Historical replay engine backed by real market data.

Runs the full simulation pipeline on real historical data for a date
or date range, producing replay frames that reflect what SimuAlpha
would have believed given only information available at that time.

CRITICAL: No future information leakage. For date T:
- Features use only data up to and including T
- Realized outcomes use only data after T
"""

from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from worker.core.logging import get_logger
from worker.data_providers.base import MarketDataProvider
from worker.engine.agents.dealer_proxy import DealerProxyAgent
from worker.engine.agents.macro_news import MacroNewsAgent
from worker.engine.agents.mean_reversion import MeanReversionAgent
from worker.engine.agents.trend_follower import TrendFollowerAgent
from worker.engine.aggregator import aggregate_actors
from worker.engine.features import (
    build_market_states,
    build_snapshot_for_date,
    compute_features,
)
from worker.engine.regime_engine import classify_regime
from worker.engine.scenario_engine import generate_scenarios
from worker.engine.signal_engine import generate_signal
from worker.schemas.actor import ActorSensitivity, ActorState
from worker.schemas.replay import ReplayFrame
from worker.schemas.signal import SignalSummary

log = get_logger("engine.historical_replay")

_AGENTS = [
    TrendFollowerAgent(),
    MeanReversionAgent(),
    DealerProxyAgent(),
    MacroNewsAgent(),
]

# Extra lookback days for feature computation (need ~60 days of history for rolling windows)
_FEATURE_LOOKBACK = 90


def replay_single_date(
    provider: MarketDataProvider,
    target_date: str,
    symbols: list[str] | None = None,
) -> ReplayFrame | None:
    """Generate a replay frame for a single historical date.

    Fetches data up to target_date, computes features, runs the full
    simulation pipeline, and attaches realized outcome from subsequent data.
    """
    symbols = symbols or ["SPY", "QQQ", "TLT", "VIX", "NVDA"]
    target = date.fromisoformat(target_date)

    # Fetch data: lookback for features + a few days forward for outcome
    start = target - timedelta(days=_FEATURE_LOOKBACK + 30)  # buffer for weekends/holidays
    end = target + timedelta(days=30)  # for realized outcome

    raw_data = provider.fetch_multi(symbols, start, end)

    # Compute features (full range, then slice to avoid leakage)
    feature_data = build_market_states(raw_data, target_date=target_date)

    # Build snapshot for target date
    snapshot = build_snapshot_for_date(feature_data, target_date)
    if snapshot is None:
        log.warning("Cannot build snapshot for %s — not a trading day or data missing", target_date)
        return None

    # Run simulation pipeline
    outputs = [agent.evaluate(snapshot) for agent in _AGENTS]
    agg = aggregate_actors(outputs)
    regime = classify_regime(snapshot, agg)
    scenarios, base_id = generate_scenarios(snapshot, agg, regime.regime)
    signal = generate_signal(snapshot, agg, regime.regime, regime.confidence)

    # Compute realized outcome from future data (no leakage: this is evaluation, not input)
    outcome = _compute_realized_outcome(raw_data.get("SPY"), target_date)

    actors = [_agent_to_actor(o) for o in outputs]

    return ReplayFrame(
        date=target_date,
        regime=regime.regime,
        regime_confidence=regime.confidence,
        net_pressure=round(agg.net_pressure, 2),
        actor_states=actors,
        scenario_branches=scenarios,
        realized_outcome=outcome,
        notes=(
            f"Historical replay for {target_date}. "
            f"Regime={regime.regime} (conf={regime.confidence:.2f}). "
            f"Signal={signal.bias} (conf={signal.confidence:.2f})."
        ),
    )


def replay_date_range(
    provider: MarketDataProvider,
    start_date: str,
    end_date: str,
    symbols: list[str] | None = None,
) -> list[ReplayFrame]:
    """Generate replay frames for a date range.

    Fetches all data once, then iterates over trading days efficiently.
    """
    symbols = symbols or ["SPY", "QQQ", "TLT", "VIX", "NVDA"]
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

    # Fetch all data at once (with lookback for features and forward for outcomes)
    fetch_start = start - timedelta(days=_FEATURE_LOOKBACK + 30)
    fetch_end = end + timedelta(days=30)
    raw_data = provider.fetch_multi(symbols, fetch_start, fetch_end)

    # Compute features for full range
    all_features: dict[str, pd.DataFrame] = {}
    for sym, df in raw_data.items():
        all_features[sym] = compute_features(df, sym)

    # Get trading days from SPY index
    spy_features = all_features.get("SPY")
    if spy_features is None or spy_features.empty:
        log.error("No SPY data available for replay range")
        return []

    trading_days = spy_features.loc[start_date:end_date].index

    frames: list[ReplayFrame] = []
    prior_signal: SignalSummary | None = None

    for td in trading_days:
        date_str = td.strftime("%Y-%m-%d")

        # Slice features up to this date (no future leakage)
        date_features = {sym: df.loc[:td] for sym, df in all_features.items()}

        snapshot = build_snapshot_for_date(date_features, date_str)
        if snapshot is None:
            continue

        outputs = [agent.evaluate(snapshot) for agent in _AGENTS]
        agg = aggregate_actors(outputs)
        regime = classify_regime(snapshot, agg)
        scenarios, _ = generate_scenarios(snapshot, agg, regime.regime)
        signal = generate_signal(snapshot, agg, regime.regime, regime.confidence, prior_signal)

        outcome = _compute_realized_outcome(raw_data.get("SPY"), date_str)
        actors = [_agent_to_actor(o) for o in outputs]

        frame = ReplayFrame(
            date=date_str,
            regime=regime.regime,
            regime_confidence=regime.confidence,
            net_pressure=round(agg.net_pressure, 2),
            actor_states=actors,
            scenario_branches=scenarios,
            realized_outcome=outcome,
            notes=(
                f"Historical replay for {date_str}. "
                f"Regime={regime.regime} (conf={regime.confidence:.2f}). "
                f"Signal={signal.bias}."
            ),
        )
        frames.append(frame)
        prior_signal = signal

    log.info("Generated %d replay frames for %s to %s", len(frames), start_date, end_date)
    return frames


def _compute_realized_outcome(
    spy_df: pd.DataFrame | None,
    target_date: str,
) -> str | None:
    """Compute what actually happened after target_date.

    Uses SPY returns over 1, 5, and 20 day forward windows.
    This is evaluation data, not input — future leakage is intentional here.
    """
    if spy_df is None or spy_df.empty or "close" not in spy_df.columns:
        return None

    target_ts = pd.Timestamp(target_date)
    close = spy_df["close"]

    if target_ts not in close.index:
        return None

    base_price = close.loc[target_ts]
    future = close.loc[target_ts:]

    parts: list[str] = []

    for horizon, label in [(1, "1d"), (5, "5d"), (20, "20d")]:
        if len(future) > horizon:
            fwd_price = future.iloc[horizon]
            fwd_ret = (fwd_price - base_price) / base_price
            direction = "advanced" if fwd_ret > 0 else "declined"
            parts.append(f"SPY {direction} {abs(fwd_ret):.2%} over {label}")

    if not parts:
        return None

    return ". ".join(parts) + "."


def _agent_to_actor(o) -> ActorState:
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
