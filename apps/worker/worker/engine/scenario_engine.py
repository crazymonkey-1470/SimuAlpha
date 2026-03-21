"""Scenario branch generation engine.

Creates 4 scenario branches (base, bull, bear, tail risk) from:
- Current regime
- Actor alignment and fragility
- Macro risk level
- Volatility regime
- Trend persistence

Probabilities are internally consistent and derived from state.
"""

from __future__ import annotations

from worker.engine.aggregator import AggregateState
from worker.engine.market_state import MarketSnapshot, VolatilityRegime
from worker.schemas.scenario import ActorReaction, ScenarioBranch


def generate_scenarios(
    snapshot: MarketSnapshot,
    agg: AggregateState,
    regime_label: str,
) -> tuple[list[ScenarioBranch], str]:
    """Generate 4 scenario branches. Returns (scenarios, base_case_id)."""
    spy = snapshot.primary

    # ── Derive raw probabilities from state ──────────────────────────────
    probs = _compute_probabilities(spy, agg, regime_label)

    scenarios = [
        _build_base_case(spy, agg, regime_label, probs["base_case"]),
        _build_bull_case(spy, agg, regime_label, probs["bull_case"]),
        _build_bear_case(spy, agg, regime_label, probs["bear_case"]),
        _build_tail_risk(spy, agg, regime_label, probs["tail_risk"]),
    ]

    return scenarios, "scenario-base-case"


def _compute_probabilities(spy, agg: AggregateState, regime: str) -> dict[str, float]:
    """Derive scenario probabilities from current state."""
    # Start with regime-dependent base rates
    if regime in ("trend_up", "macro_risk_on"):
        raw = {"base_case": 0.50, "bull_case": 0.25, "bear_case": 0.18, "tail_risk": 0.07}
    elif regime in ("trend_down", "macro_risk_off"):
        raw = {"base_case": 0.40, "bull_case": 0.10, "bear_case": 0.35, "tail_risk": 0.15}
    elif regime in ("fragile_uptrend", "unstable_rally"):
        raw = {"base_case": 0.42, "bull_case": 0.15, "bear_case": 0.28, "tail_risk": 0.15}
    elif regime == "squeeze":
        raw = {"base_case": 0.35, "bull_case": 0.25, "bear_case": 0.25, "tail_risk": 0.15}
    else:  # chop or unknown
        raw = {"base_case": 0.45, "bull_case": 0.18, "bear_case": 0.25, "tail_risk": 0.12}

    # ── State-based adjustments ──────────────────────────────────────────
    # High fragility: shift probability from base to bear/tail
    if agg.fragility_score > 0.6:
        shift = (agg.fragility_score - 0.5) * 0.15
        raw["base_case"] -= shift
        raw["bear_case"] += shift * 0.6
        raw["tail_risk"] += shift * 0.4

    # High macro event risk: increase tail risk
    if spy.macro_event_risk > 0.5:
        shift = (spy.macro_event_risk - 0.4) * 0.12
        raw["base_case"] -= shift * 0.5
        raw["bull_case"] -= shift * 0.3
        raw["tail_risk"] += shift * 0.8

    # Strong agreement + strong net pressure: increase base case
    if agg.agreement_score > 0.6 and abs(agg.net_pressure) > 0.2:
        raw["base_case"] += 0.05
        raw["tail_risk"] -= 0.03

    # Normalize
    total = sum(raw.values())
    return {k: round(v / total, 2) for k, v in raw.items()}


def _build_base_case(spy, agg, regime, prob) -> ScenarioBranch:
    direction = _regime_base_direction(regime)
    return ScenarioBranch(
        id="scenario-base-case",
        name=_base_case_name(regime),
        probability=prob,
        direction=direction,
        drivers=_base_case_drivers(spy, agg, regime),
        invalidation_conditions=_base_case_invalidation(spy, agg, regime),
        actor_reactions=[
            ActorReaction(
                actor_archetype="trend_follower",
                expected_behavior=f"Maintain {direction.split()[0] if 'bullish' in direction else 'reduced'} bias with {'steady' if agg.agreement_score > 0.5 else 'declining'} conviction",
            ),
            ActorReaction(
                actor_archetype="mean_reverter",
                expected_behavior="Fade minor extensions; overall neutral positioning within range",
            ),
            ActorReaction(
                actor_archetype="options_dealer",
                expected_behavior=f"{'Stabilizing hedging flows support range' if spy.dealer_support_proxy > 0 else 'Dealer flow becoming directionally neutral'}",
            ),
        ],
        risk_level="moderate" if agg.fragility_score < 0.5 else "elevated",
        notes=f"Base case reflects current regime ({regime}) continuation. Probability reflects {agg.agreement_score:.0%} actor agreement and {agg.fragility_score:.2f} fragility.",
    )


def _build_bull_case(spy, agg, regime, prob) -> ScenarioBranch:
    return ScenarioBranch(
        id="scenario-bull-case",
        name=_bull_case_name(spy, agg),
        probability=prob,
        direction="bullish",
        drivers=_bull_case_drivers(spy, agg),
        invalidation_conditions=[
            "Breadth fails to confirm new highs within 2 sessions",
            "Volume declines into advance (exhaustion signal)",
            f"VIX rises above {spy.realized_vol * 100 * 1.5:.0f} invalidating breakout thesis",
        ],
        actor_reactions=[
            ActorReaction(actor_archetype="trend_follower", expected_behavior="Conviction surges; aggressive position building as momentum accelerates"),
            ActorReaction(actor_archetype="mean_reverter", expected_behavior="Fades initial extension; forced to cover if momentum persists beyond 2σ"),
            ActorReaction(actor_archetype="macro_reactive", expected_behavior="Shifts to risk-on positioning as macro backdrop confirms"),
        ],
        risk_level="moderate",
        notes=f"Bull scenario requires catalyst alignment. Net pressure currently at {agg.net_pressure:+.2f}; breakout needs pressure above +0.30.",
    )


def _build_bear_case(spy, agg, regime, prob) -> ScenarioBranch:
    return ScenarioBranch(
        id="scenario-bear-case",
        name=_bear_case_name(spy, agg),
        probability=prob,
        direction="bearish",
        drivers=_bear_case_drivers(spy, agg),
        invalidation_conditions=[
            f"SPY holds above {spy.price * 0.97:.0f} (3% drawdown level) for 3+ sessions",
            "Breadth stabilizes and advances outnumber declines",
            "VIX fails to sustain above 20",
        ],
        actor_reactions=[
            ActorReaction(actor_archetype="trend_follower", expected_behavior="De-risks as volatility regime shifts; momentum signals flatten or reverse"),
            ActorReaction(actor_archetype="options_dealer", expected_behavior="Dealer gamma flips negative; hedging flows amplify downside"),
            ActorReaction(actor_archetype="macro_reactive", expected_behavior="Rapid de-risking; flight to quality into treasuries"),
        ],
        risk_level="elevated",
        notes=f"Bear scenario weighted by fragility ({agg.fragility_score:.2f}) and {'negative dealer gamma' if spy.dealer_support_proxy < 0 else 'macro risk'}. Drawdown likely concentrated in first 2-3 sessions.",
    )


def _build_tail_risk(spy, agg, regime, prob) -> ScenarioBranch:
    return ScenarioBranch(
        id="scenario-tail-risk",
        name="Exogenous shock or cascade liquidation",
        probability=prob,
        direction="sharply bearish",
        drivers=[
            "Unexpected macro or geopolitical shock forces simultaneous de-risking",
            "Correlation spike invalidates diversification assumptions across asset classes",
            "Liquidity withdrawal across bid-side as dealer gamma goes deeply negative",
            f"Event risk ({spy.macro_event_risk:.2f}) catalyzes cascade beyond normal distribution",
        ],
        invalidation_conditions=[
            "Geopolitical risk index remains below critical threshold",
            "Credit spreads stay contained (HYG holds above support)",
            "Central bank provides explicit backstop guidance",
        ],
        actor_reactions=[
            ActorReaction(actor_archetype="trend_follower", expected_behavior="Full de-risk triggered; systematic selling amplifies move"),
            ActorReaction(actor_archetype="options_dealer", expected_behavior="Deeply negative gamma; hedging becomes the dominant selling force"),
            ActorReaction(actor_archetype="macro_reactive", expected_behavior="Indiscriminate liquidation; flight to cash and sovereign bonds"),
            ActorReaction(actor_archetype="mean_reverter", expected_behavior="Engages at support levels but may be overwhelmed by flow magnitude"),
        ],
        risk_level="high",
        notes=f"Left-tail event. Probability calibrated to current macro risk ({spy.macro_event_risk:.2f}), vol regime ({spy.volatility_regime.value}), and fragility ({agg.fragility_score:.2f}). Non-linear loss distribution.",
    )


# ── Helper functions for state-aware naming and drivers ──────────────────────

def _regime_base_direction(regime: str) -> str:
    return {
        "trend_up": "mildly bullish",
        "trend_down": "bearish",
        "fragile_uptrend": "mildly bullish",
        "unstable_rally": "neutral",
        "chop": "neutral",
        "squeeze": "neutral",
        "macro_risk_on": "mildly bullish",
        "macro_risk_off": "mildly bearish",
    }.get(regime, "neutral")


def _base_case_name(regime: str) -> str:
    return {
        "trend_up": "Trend continuation with steady inflows",
        "trend_down": "Continued downside with measured selling",
        "fragile_uptrend": "Grinding continuation on narrowing support",
        "unstable_rally": "Range-bound consolidation as internals stabilize",
        "chop": "Continued range-bound oscillation",
        "squeeze": "Compressed range persists into catalyst",
        "macro_risk_on": "Risk-on continuation on macro support",
        "macro_risk_off": "Cautious positioning pending macro resolution",
    }.get(regime, "Current regime persists")


def _bull_case_name(spy, agg) -> str:
    if spy.volatility_regime == VolatilityRegime.COMPRESSED:
        return "Volatility breakout with short squeeze"
    if agg.net_pressure > 0.15:
        return "Momentum breakout as actor alignment strengthens"
    return "Positive catalyst drives broad-based re-risking"


def _bear_case_name(spy, agg) -> str:
    if agg.fragility_score > 0.6:
        return "Fragility-driven correction as support collapses"
    if spy.dealer_support_proxy < -0.2:
        return "Dealer destabilization triggers accelerated selling"
    return "Risk repricing on macro deterioration"


def _base_case_drivers(spy, agg, regime) -> list[str]:
    drivers = []
    if agg.net_pressure > 0:
        drivers.append(f"Net positive actor pressure ({agg.net_pressure:+.2f}) sustains bid floor")
    else:
        drivers.append(f"Net negative actor pressure ({agg.net_pressure:+.2f}) limits upside")

    drivers.append(f"Volatility regime ({spy.volatility_regime.value}) compatible with current range")

    if spy.macro_event_risk < 0.3:
        drivers.append("Absence of near-term macro catalyst maintains status quo")
    else:
        drivers.append(f"Event risk ({spy.macro_event_risk:.2f}) creating cautious backdrop but not forcing repositioning")

    return drivers


def _base_case_invalidation(spy, agg, regime) -> list[str]:
    conditions = []
    if spy.volatility_regime in (VolatilityRegime.COMPRESSED, VolatilityRegime.NORMAL):
        conditions.append(f"Realized vol expands above {spy.realized_vol * 100 * 1.5:.0f}% annualized for 2+ sessions")
    conditions.append("Actor alignment shifts decisively (agreement drops below 0.25)")
    if spy.macro_event_risk > 0.3:
        conditions.append("Macro event materializes with outcome outside consensus expectations")
    else:
        conditions.append("Unexpected macro catalyst forces broad repositioning")
    return conditions


def _bull_case_drivers(spy, agg) -> list[str]:
    drivers = ["Positive macro surprise or dovish policy shift compresses risk premia"]
    if agg.bullish_count >= 3:
        drivers.append("Broad actor alignment on the long side accelerates positioning")
    else:
        drivers.append("Short covering cascade as underweight actors are forced to add")
    if spy.volatility_regime == VolatilityRegime.COMPRESSED:
        drivers.append("Volatility breakout from compressed range triggers gamma-driven acceleration")
    else:
        drivers.append("Breadth expansion confirms move beyond narrow leadership")
    return drivers


def _bear_case_drivers(spy, agg) -> list[str]:
    drivers = []
    if spy.dealer_support_proxy < 0:
        drivers.append("Dealer gamma flips negative; hedging flows amplify downside moves")
    else:
        drivers.append("Dealer support erodes as spot approaches concentration zone boundary")

    if spy.macro_event_risk > 0.3:
        drivers.append(f"Macro event ({spy.macro_event_risk:.2f} risk) materializes unfavorably")
    else:
        drivers.append("Unexpected earnings or data miss reprices growth expectations")

    drivers.append(f"Fragility ({agg.fragility_score:.2f}) converts orderly selling into momentum-driven correction")
    return drivers
