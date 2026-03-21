"""Rules-based regime classification engine.

Derives the current market regime from:
- Market state (trend, vol, breadth, macro risk)
- Aggregate actor outputs (net pressure, agreement, fragility)

This is deterministic and transparent — no hidden ML model.
Future calibration can tune thresholds and weights.
"""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field

from worker.engine.aggregator import AggregateState
from worker.engine.market_state import MarketSnapshot, VolatilityRegime
from worker.schemas.regime import RegimeDriver, RegimeSnapshot


# ── Regime labels and their classification rules ────────────────────────────

# Priority-ordered: first matching rule wins.
# Each rule is (label, condition_fn, base_confidence)


def classify_regime(
    snapshot: MarketSnapshot,
    agg: AggregateState,
    ts: datetime | None = None,
) -> RegimeSnapshot:
    """Classify the current market regime from state and actor aggregates."""
    ts = ts or datetime.now(timezone.utc)
    spy = snapshot.primary

    # Score each regime candidate
    scores = _score_all_regimes(spy, agg)

    # Pick the highest-scoring regime
    best_label, best_score = max(scores.items(), key=lambda kv: kv[1])
    confidence = max(0.30, min(0.95, best_score))

    # Generate supporting data
    drivers = _identify_drivers(spy, agg)
    risk_flags = _identify_risk_flags(spy, agg)
    posture = _derive_posture(best_label, agg, spy)
    summary = _generate_summary(best_label, spy, agg, drivers)

    return RegimeSnapshot(
        regime=best_label,
        confidence=round(confidence, 2),
        net_pressure=round(agg.net_pressure, 2),
        posture=posture,
        risk_flags=risk_flags,
        drivers=drivers,
        summary=summary,
        updated_at=ts,
    )


def _score_all_regimes(spy, agg: AggregateState) -> dict[str, float]:
    """Score each regime label — highest score wins."""
    scores: dict[str, float] = {}

    ts = spy.trend_strength
    vol = spy.volatility_regime
    mr = spy.macro_event_risk
    breadth = spy.breadth_proxy
    frag = agg.fragility_score
    np = agg.net_pressure
    agree = agg.agreement_score

    # ── trend_up: strong uptrend with confirming breadth ─────────────────
    scores["trend_up"] = (
        0.35 * max(0, ts)
        + 0.20 * max(0, breadth)
        + 0.15 * max(0, np)
        + 0.15 * agree
        + 0.15 * _vol_bonus(vol, "low")
    )

    # ── trend_down: strong downtrend with confirming breadth ─────────────
    scores["trend_down"] = (
        0.35 * max(0, -ts)
        + 0.20 * max(0, -breadth)
        + 0.15 * max(0, -np)
        + 0.15 * agree
        + 0.15 * _vol_bonus(vol, "high")
    )

    # ── fragile_uptrend: positive trend but fragility elevated ───────────
    scores["fragile_uptrend"] = (
        0.25 * max(0, ts)
        + 0.25 * frag
        + 0.15 * max(0, np)
        + 0.15 * (1 - agree)  # Disagreement
        + 0.10 * max(0, -breadth + 0.3)  # Narrowing breadth
        + 0.10 * _vol_bonus(vol, "normal")
    )

    # ── unstable_rally: positive returns but internals deteriorating ─────
    scores["unstable_rally"] = (
        0.20 * max(0, ts)
        + 0.25 * frag
        + 0.20 * max(0, -breadth)  # Bad breadth despite positive trend
        + 0.20 * (1 - agree)
        + 0.15 * _vol_bonus(vol, "elevated")
    )

    # ── chop: no clear direction, mixed signals ──────────────────────────
    scores["chop"] = (
        0.30 * (1 - abs(ts))  # Weak trend
        + 0.25 * (1 - abs(np))  # Low net pressure
        + 0.20 * (1 - agree)  # Disagreement
        + 0.15 * _vol_bonus(vol, "normal")
        + 0.10 * (1 - abs(breadth))
    )

    # ── squeeze: compressed vol with building pressure ───────────────────
    scores["squeeze"] = (
        0.35 * _vol_bonus(vol, "compressed")
        + 0.25 * (1 - abs(ts))  # Range-bound
        + 0.20 * agg.avg_conviction  # Actors positioning despite quiet market
        + 0.20 * max(0, spy.gap_risk)
    )

    # ── macro_risk_on: low event risk, positive sentiment ────────────────
    scores["macro_risk_on"] = (
        0.30 * max(0, spy.sentiment_score)
        + 0.25 * (1 - mr)
        + 0.20 * max(0, np)
        + 0.15 * max(0, ts)
        + 0.10 * max(0, breadth)
    )

    # ── macro_risk_off: high event risk, negative sentiment ──────────────
    scores["macro_risk_off"] = (
        0.30 * max(0, -spy.sentiment_score)
        + 0.25 * mr
        + 0.20 * max(0, -np)
        + 0.15 * _vol_bonus(vol, "elevated")
        + 0.10 * max(0, -breadth)
    )

    return scores


def _vol_bonus(regime: VolatilityRegime, desired: str) -> float:
    """Return 1.0 if vol regime matches desired level, 0.0 otherwise."""
    mapping = {
        "compressed": VolatilityRegime.COMPRESSED,
        "low": VolatilityRegime.COMPRESSED,
        "normal": VolatilityRegime.NORMAL,
        "elevated": VolatilityRegime.ELEVATED,
        "high": VolatilityRegime.ELEVATED,
        "extreme": VolatilityRegime.EXTREME,
    }
    target = mapping.get(desired, VolatilityRegime.NORMAL)
    if regime == target:
        return 1.0
    # Adjacent regimes get partial credit
    order = [VolatilityRegime.COMPRESSED, VolatilityRegime.NORMAL, VolatilityRegime.ELEVATED, VolatilityRegime.EXTREME]
    dist = abs(order.index(regime) - order.index(target))
    return max(0, 1.0 - dist * 0.4)


def _identify_drivers(spy, agg: AggregateState) -> list[RegimeDriver]:
    """Identify the top factors driving the current regime."""
    drivers: list[RegimeDriver] = []

    # Actor-based driver: dominant actor
    dom = agg.dominant_actor
    dom_output = next((o for o in agg.actor_outputs if o.archetype == dom), None)
    if dom_output:
        drivers.append(RegimeDriver(
            factor=f"{dom_output.agent_name.lower()} positioning",
            influence=round(dom_output.contribution, 2),
            description=dom_output.rationale[:150],
        ))

    # Trend driver
    if abs(spy.trend_strength) > 0.2:
        drivers.append(RegimeDriver(
            factor="trend momentum",
            influence=round(spy.trend_strength * 0.4, 2),
            description=f"Trend strength at {spy.trend_strength:.2f}; {'supporting' if spy.trend_strength > 0 else 'undermining'} current direction",
        ))

    # Vol driver
    vol_influence = {"compressed": 0.15, "normal": 0.0, "elevated": -0.20, "extreme": -0.40}
    vi = vol_influence.get(spy.volatility_regime.value, 0.0)
    if abs(vi) > 0.05:
        drivers.append(RegimeDriver(
            factor="volatility regime",
            influence=round(vi, 2),
            description=f"Realized vol at {spy.realized_vol:.1%}; {spy.volatility_regime.value} regime {'compressing range' if vi > 0 else 'expanding risk'}",
        ))

    # Macro driver
    if spy.macro_event_risk > 0.3:
        drivers.append(RegimeDriver(
            factor="macro event risk",
            influence=round(-spy.macro_event_risk * 0.3, 2),
            description=f"Event risk elevated at {spy.macro_event_risk:.2f}; creating uncertainty overhang",
        ))

    return drivers[:4]


def _identify_risk_flags(spy, agg: AggregateState) -> list[str]:
    """Generate risk warnings based on current state."""
    flags: list[str] = []

    if agg.fragility_score > 0.6:
        flags.append(f"Fragility elevated ({agg.fragility_score:.2f}); actor alignment unstable")

    if spy.breadth_proxy < -0.2 and spy.trend_strength > 0.2:
        flags.append("Breadth deteriorating despite positive trend; divergence risk")

    if spy.gap_risk > 0.4:
        flags.append(f"Gap risk elevated ({spy.gap_risk:.2f}); overnight exposure demands hedging")

    if spy.macro_event_risk > 0.5:
        flags.append(f"Macro event risk at {spy.macro_event_risk:.2f}; binary outcome window approaching")

    if spy.volatility_regime in (VolatilityRegime.ELEVATED, VolatilityRegime.EXTREME):
        flags.append(f"Volatility regime {spy.volatility_regime.value}; hedging costs elevated and positioning unstable")

    if agg.agreement_score < 0.3:
        flags.append("Actor disagreement high; directional conviction unreliable")

    # Dealer specific
    if spy.dealer_support_proxy < -0.3:
        flags.append("Dealer gamma negative; hedging flows amplifying moves rather than stabilizing")

    return flags[:5]


_POSTURE_MAP = {
    "trend_up": "long with trailing protection",
    "trend_down": "reduced exposure; tactical short via options structures",
    "fragile_uptrend": "cautiously long, hedged tails",
    "unstable_rally": "light long with tight stops; convex hedge overlay",
    "chop": "balanced book, no directional tilt; sell premium",
    "squeeze": "neutral with convex hedge overlay; position for breakout",
    "macro_risk_on": "maintain core long exposure with tail hedges",
    "macro_risk_off": "maximum defensive; cash and convexity",
}


def _derive_posture(regime: str, agg: AggregateState, spy) -> str:
    base = _POSTURE_MAP.get(regime, "balanced book, no directional tilt")

    # Modify posture based on fragility
    if agg.fragility_score > 0.65 and "defensive" not in base:
        base += "; reduce on strength given elevated fragility"

    return base


def _generate_summary(regime: str, spy, agg: AggregateState, drivers: list[RegimeDriver]) -> str:
    """Generate an analyst-grade narrative summary of the current regime."""
    parts: list[str] = []

    # Regime characterization
    regime_desc = {
        "trend_up": "Trend-up regime intact",
        "trend_down": "Trend-down regime dominant",
        "fragile_uptrend": "Fragile uptrend persists but structural support is narrowing",
        "unstable_rally": "Rally continues on deteriorating internals",
        "chop": "Directionless chop with no actor class achieving dominance",
        "squeeze": "Volatility compression creating squeeze conditions",
        "macro_risk_on": "Macro risk-on environment supporting broad-based positioning",
        "macro_risk_off": "Macro risk-off pressure compressing risk appetite",
    }
    parts.append(regime_desc.get(regime, f"Market in {regime} regime"))

    # Driver context
    if drivers:
        top = drivers[0]
        parts.append(f"{top.factor.capitalize()} is the primary influence ({top.influence:+.2f})")

    # Actor state
    if agg.agreement_score > 0.6:
        parts.append(f"Actor alignment broadly supportive of current direction (agreement={agg.agreement_score:.2f})")
    else:
        parts.append(f"Actor disagreement elevated (agreement={agg.agreement_score:.2f}); internal tension present")

    # Fragility warning
    if agg.fragility_score > 0.6:
        parts.append(f"Structural fragility at {agg.fragility_score:.2f} suggests vulnerability to regime transition")
    elif agg.fragility_score > 0.4:
        parts.append(f"Moderate fragility ({agg.fragility_score:.2f}); regime holds but transition risk is non-trivial")

    return ". ".join(parts) + "."
