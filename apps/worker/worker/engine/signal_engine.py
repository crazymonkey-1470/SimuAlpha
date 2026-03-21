"""Signal generation engine.

Produces a structured signal summary from:
- Regime classification
- Actor alignment and aggregate state
- Scenario structure
- Fragility
- Macro event risk

Signal postures:
- long_with_caution
- neutral_wait
- tactical_short
- convex_hedge_favored
- elevated_event_risk
"""

from __future__ import annotations

from datetime import datetime, timezone

from worker.engine.aggregator import AggregateState
from worker.engine.market_state import MarketSnapshot, VolatilityRegime
from worker.schemas.signal import SignalSummary


def generate_signal(
    snapshot: MarketSnapshot,
    agg: AggregateState,
    regime_label: str,
    regime_confidence: float,
    prior_signal: SignalSummary | None = None,
    ts: datetime | None = None,
) -> SignalSummary:
    """Generate a signal summary from current state."""
    ts = ts or datetime.now(timezone.utc)
    spy = snapshot.primary

    # ── Composite signal score ───────────────────────────────────────────
    # Positive = bullish, negative = bearish
    signal_score = _compute_signal_score(spy, agg, regime_label, regime_confidence)

    # ── Classify bias ────────────────────────────────────────────────────
    bias = _classify_bias(signal_score)

    # ── Confidence ───────────────────────────────────────────────────────
    confidence = _compute_confidence(spy, agg, regime_confidence)

    # ── Time horizon ─────────────────────────────────────────────────────
    horizon = _derive_horizon(spy, agg)

    # ── Posture ──────────────────────────────────────────────────────────
    posture = _derive_posture(signal_score, spy, agg)

    # ── Warnings ─────────────────────────────────────────────────────────
    warnings = _generate_warnings(spy, agg, regime_label)

    # ── Change vs prior ──────────────────────────────────────────────────
    change_vs_prior = _compute_change(bias, confidence, prior_signal)

    return SignalSummary(
        bias=bias,
        confidence=round(confidence, 2),
        time_horizon=horizon,
        suggested_posture=posture,
        warnings=warnings,
        change_vs_prior=change_vs_prior,
        updated_at=ts,
    )


def _compute_signal_score(spy, agg: AggregateState, regime: str, regime_conf: float) -> float:
    """Composite score: positive = bullish, negative = bearish."""
    components = []

    # 1. Net pressure from actors (weight: 0.30)
    components.append(0.30 * agg.net_pressure)

    # 2. Regime directional bias (weight: 0.25)
    regime_bias = {
        "trend_up": 0.5,
        "trend_down": -0.5,
        "fragile_uptrend": 0.2,
        "unstable_rally": 0.1,
        "chop": 0.0,
        "squeeze": 0.0,
        "macro_risk_on": 0.4,
        "macro_risk_off": -0.4,
    }.get(regime, 0.0)
    components.append(0.25 * regime_bias * regime_conf)

    # 3. Trend strength (weight: 0.20)
    components.append(0.20 * spy.trend_strength)

    # 4. Fragility penalty (weight: 0.15)
    # High fragility pulls signal toward neutral
    components.append(-0.15 * agg.fragility_score * _sign(sum(components)))

    # 5. Macro event risk dampener (weight: 0.10)
    # High event risk pulls signal toward neutral
    components.append(-0.10 * spy.macro_event_risk * _sign(sum(components)))

    return sum(components)


def _classify_bias(score: float) -> str:
    if score > 0.20:
        return "bullish"
    elif score > 0.08:
        return "mildly bullish"
    elif score > -0.08:
        return "neutral"
    elif score > -0.20:
        return "mildly bearish"
    return "bearish"


def _compute_confidence(spy, agg: AggregateState, regime_conf: float) -> float:
    """Signal confidence is higher when multiple factors align."""
    base = 0.50

    # Agreement boosts confidence
    base += agg.agreement_score * 0.15

    # Regime confidence feeds through
    base += regime_conf * 0.15

    # Low fragility boosts confidence
    base += (1 - agg.fragility_score) * 0.10

    # Low event risk boosts confidence
    base += (1 - spy.macro_event_risk) * 0.10

    return max(0.25, min(0.90, base))


def _derive_horizon(spy, agg: AggregateState) -> str:
    # Shorter horizon when vol is high or fragility is elevated
    if spy.volatility_regime in (VolatilityRegime.ELEVATED, VolatilityRegime.EXTREME):
        return "1-3 days"
    if agg.fragility_score > 0.6:
        return "3-5 days"
    if spy.macro_event_risk > 0.5:
        return "event-dependent"
    return "1-2 weeks"


def _derive_posture(score: float, spy, agg: AggregateState) -> str:
    # Event risk override
    if spy.macro_event_risk > 0.6:
        return "elevated_event_risk: reduce directional exposure pending event resolution; maintain convex hedges"

    # Fragility override
    if agg.fragility_score > 0.7:
        return "convex_hedge_favored: fragility elevated; favor asymmetric protection over directional exposure"

    if score > 0.15:
        if agg.fragility_score > 0.5:
            return "long_with_caution: maintain core long but hedge tails given elevated fragility"
        return "long_with_caution: maintain core long exposure with trailing protection; reduce on strength above resistance"

    if score < -0.15:
        if abs(score) > 0.25:
            return "tactical_short: short via options structures or reduced long exposure; protect against acceleration"
        return "tactical_short: light short bias via put spreads or reduced equity weight"

    return "neutral_wait: balanced book with no directional tilt; sell premium where vol is rich; wait for clarity"


def _generate_warnings(spy, agg: AggregateState, regime: str) -> list[str]:
    warnings: list[str] = []

    if agg.fragility_score > 0.5:
        warnings.append(f"Fragility score elevated at {agg.fragility_score:.2f}; regime transition risk non-trivial")

    if agg.agreement_score < 0.4:
        warnings.append("Actor disagreement high; signal conviction below threshold for aggressive positioning")

    if spy.dealer_support_proxy < -0.2:
        warnings.append("Dealer gamma negative; hedging flows may amplify rather than dampen moves")

    if spy.macro_event_risk > 0.4:
        warnings.append(f"Event risk window ({spy.macro_event_risk:.2f}); signal reliability may decrease around binary outcomes")

    if spy.breadth_proxy < -0.2 and spy.trend_strength > 0.15:
        warnings.append("Momentum breadth deteriorating despite index strength; narrowing leadership")

    if spy.volatility_regime == VolatilityRegime.EXTREME:
        warnings.append("Extreme vol regime; position sizing should reflect elevated tail risk")

    return warnings[:4]


def _compute_change(bias: str, confidence: float, prior: SignalSummary | None) -> str:
    if prior is None:
        return f"Initial signal: {bias} at {confidence:.0%} confidence. No prior period for comparison."

    bias_changed = bias != prior.bias
    conf_delta = confidence - prior.confidence

    parts: list[str] = []
    if bias_changed:
        parts.append(f"Bias shifted from {prior.bias} to {bias}")
    else:
        parts.append(f"Bias unchanged at {bias}")

    parts.append(f"Confidence moved from {prior.confidence:.2f} to {confidence:.2f} ({conf_delta:+.2f})")

    if conf_delta < -0.05:
        parts.append("Driven by deteriorating actor alignment or rising fragility")
    elif conf_delta > 0.05:
        parts.append("Supported by improving actor alignment and signal coherence")

    return ". ".join(parts) + "."


def _sign(v: float) -> float:
    return 1.0 if v > 0 else (-1.0 if v < 0 else 0.0)
