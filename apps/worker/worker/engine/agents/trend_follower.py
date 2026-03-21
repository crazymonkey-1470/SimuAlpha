"""TrendFollowerAgent — systematic trend-following actor.

Reacts to:
- Sustained returns over medium horizon (return_20d)
- Trend strength and persistence
- Momentum score alignment across timeframes
- Volatility compatibility (trends break down in high vol)

Logic:
- Goes long when trend_strength positive AND momentum confirms AND vol isn't extreme
- Goes short when trend_strength negative AND momentum confirms
- Conviction scales with trend persistence and return magnitude
- Reduces conviction when vol regime shifts unfavorably
"""

from __future__ import annotations

from worker.engine.agents.base import AgentOutput, BaseAgent
from worker.engine.market_state import MarketSnapshot, VolatilityRegime


class TrendFollowerAgent(BaseAgent):
    agent_id = "actor-tf-01"
    agent_name = "Systematic Trend Followers"
    archetype = "trend_follower"
    horizon = "2-6 weeks"

    def evaluate(self, snapshot: MarketSnapshot) -> AgentOutput:
        spy = snapshot.states["SPY"]

        # ── Core signal: weighted trend composite ────────────────────────
        # Combine trend_strength (slow) with momentum (medium) and return direction (fast)
        trend_signal = (
            0.50 * spy.trend_strength
            + 0.30 * spy.momentum_score
            + 0.20 * _return_signal(spy.return_20d)
        )

        # ── Volatility penalty ──────────────────────────────────────────
        # Trend-followers reduce exposure when vol expands — trends become unreliable
        vol_penalty = _vol_penalty(spy.volatility_regime, spy.realized_vol)

        # ── Cross-asset confirmation ────────────────────────────────────
        # Check if QQQ confirms equity trend direction
        qqq = snapshot.states.get("QQQ")
        confirmation_bonus = 0.0
        if qqq:
            qqq_aligned = (spy.trend_strength > 0 and qqq.trend_strength > 0) or \
                          (spy.trend_strength < 0 and qqq.trend_strength < 0)
            confirmation_bonus = 0.08 if qqq_aligned else -0.05

        # ── Compute outputs ─────────────────────────────────────────────
        raw_conviction = abs(trend_signal) * (1 - vol_penalty) + confirmation_bonus
        conviction = self._clamp(raw_conviction, 0.05, 0.95)
        bias = self._classify_bias(trend_signal)

        # Contribution: conviction scaled by direction
        direction = 1.0 if trend_signal >= 0 else -1.0
        contribution = self._clamp(direction * conviction * 0.7, -0.5, 0.5)

        # Confidence: higher when signals align, lower in choppy conditions
        signal_alignment = abs(spy.trend_strength - spy.momentum_score)
        confidence = self._clamp(0.75 - signal_alignment * 0.5 - vol_penalty * 0.3, 0.3, 0.95)

        rationale = _build_rationale(spy, trend_signal, vol_penalty, bias, conviction, confirmation_bonus)

        return AgentOutput(
            agent_id=self.agent_id,
            agent_name=self.agent_name,
            archetype=self.archetype,
            bias=bias,
            conviction=round(conviction, 2),
            contribution=round(contribution, 2),
            confidence=round(confidence, 2),
            horizon=self.horizon,
            rationale=rationale,
            sensitivities=[
                {"factor": "price momentum", "weight": 0.85},
                {"factor": "volatility regime", "weight": -0.40},
            ],
        )


def _return_signal(return_20d: float) -> float:
    """Convert 20-day return into a -1 to +1 signal."""
    # ~5% over 20 days is a strong signal
    return max(-1, min(1, return_20d / 0.05))


def _vol_penalty(regime: VolatilityRegime, realized_vol: float) -> float:
    """Penalty applied to conviction when vol is unfavorable for trend-following."""
    penalties = {
        VolatilityRegime.COMPRESSED: 0.0,
        VolatilityRegime.NORMAL: 0.05,
        VolatilityRegime.ELEVATED: 0.25,
        VolatilityRegime.EXTREME: 0.50,
    }
    return penalties[regime]


def _build_rationale(spy, trend_signal, vol_penalty, bias, conviction, confirmation) -> str:
    parts: list[str] = []

    # Trend assessment
    strength = abs(spy.trend_strength)
    if strength > 0.5:
        parts.append(f"Strong {'up' if spy.trend_strength > 0 else 'down'}trend detected (strength={spy.trend_strength:.2f})")
    elif strength > 0.2:
        parts.append(f"Moderate trend signal present (strength={spy.trend_strength:.2f})")
    else:
        parts.append(f"Trend signal weak and indeterminate (strength={spy.trend_strength:.2f})")

    # Momentum confirmation
    if abs(spy.momentum_score) > 0.3:
        aligned = (spy.trend_strength > 0) == (spy.momentum_score > 0)
        parts.append(f"Momentum {'confirms' if aligned else 'diverges from'} trend direction")
    else:
        parts.append("Momentum score near neutral; limited confirmation")

    # Vol impact
    if vol_penalty > 0.2:
        parts.append(f"Volatility regime ({spy.volatility_regime.value}) penalizing conviction by {vol_penalty:.0%}")
    elif vol_penalty > 0:
        parts.append(f"Vol regime ({spy.volatility_regime.value}) applying minor friction")

    # Cross-asset
    if confirmation > 0:
        parts.append("Cross-asset momentum aligned (QQQ confirming)")
    elif confirmation < 0:
        parts.append("Cross-asset divergence present (QQQ not confirming)")

    return ". ".join(parts)
