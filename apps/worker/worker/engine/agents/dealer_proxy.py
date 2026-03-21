"""DealerProxyAgent — options dealer hedging flow proxy.

Models the net effect of dealer gamma hedging on market dynamics.
This is not a real options dealer — it proxies the stabilizing/destabilizing
effect of dealer hedging flows based on observable market state.

Reacts to:
- Volatility regime (dealers stabilize in low vol, destabilize in high vol)
- Dealer support proxy (positive gamma = stabilizing, negative = destabilizing)
- Squeeze conditions (compressed vol near breakout)
- Gap risk (dealers become destabilizing when gap risk is high)

Logic:
- Positive gamma: dealer hedging provides a stabilizing bid/offer → dampens moves
- Negative gamma: dealer hedging amplifies moves → destabilizing
- Vol expansion triggers gamma flip → conviction shifts to destabilizing
- Squeeze detection: compressed vol + positioning → potential breakout amplification
"""

from __future__ import annotations

from worker.engine.agents.base import AgentOutput, BaseAgent
from worker.engine.market_state import MarketSnapshot, VolatilityRegime


class DealerProxyAgent(BaseAgent):
    agent_id = "actor-od-01"
    agent_name = "Options Dealer Proxy"
    archetype = "options_dealer"
    horizon = "intraday to weekly (gamma-dependent)"

    def evaluate(self, snapshot: MarketSnapshot) -> AgentOutput:
        spy = snapshot.states["SPY"]
        vix = snapshot.states.get("VIX")

        # ── Gamma regime assessment ──────────────────────────────────────
        gamma_state = spy.dealer_support_proxy  # +1 stabilizing, -1 destabilizing

        # ── Vol regime impact ────────────────────────────────────────────
        # In compressed/normal vol: dealers tend to stabilize
        # In elevated/extreme vol: dealers tend to destabilize
        vol_modifier = _vol_regime_modifier(spy.volatility_regime)

        # Effective gamma = base gamma adjusted by vol regime
        effective_gamma = gamma_state + vol_modifier

        # ── Squeeze detection ────────────────────────────────────────────
        # Compressed vol + neutral dealer → potential breakout amplification
        squeeze_risk = 0.0
        if spy.volatility_regime == VolatilityRegime.COMPRESSED and abs(gamma_state) < 0.3:
            squeeze_risk = 0.4 + abs(spy.momentum_score) * 0.3

        # ── VIX confirmation ─────────────────────────────────────────────
        vix_stress = 0.0
        if vix:
            # VIX rising rapidly signals dealer stress
            if vix.return_1d > 0.05:  # 5%+ VIX spike
                vix_stress = min(0.3, vix.return_1d * 2)

        # ── Compute outputs ─────────────────────────────────────────────
        # Bias: dealers are not directional — they're stabilizing or destabilizing
        # Positive effective gamma → neutral (dampening moves)
        # Negative effective gamma → neutral but with destabilizing contribution
        if effective_gamma > 0.3:
            bias = "neutral"  # Stabilizing — market stays range-bound
            contribution_raw = -abs(spy.return_1d) * 5  # Dampens recent move
        elif effective_gamma < -0.3:
            bias = "neutral"  # Destabilizing — amplifies moves
            # Contribution amplifies existing direction
            contribution_raw = spy.return_1d * 8  # Amplifies recent move
        else:
            bias = "neutral"
            contribution_raw = 0.0

        # Conviction: how strongly dealers are influencing
        conviction = self._clamp(
            abs(effective_gamma) * 0.6
            + squeeze_risk * 0.3
            + vix_stress * 0.4,
            0.10, 0.95,
        )

        contribution = self._clamp(contribution_raw, -0.40, 0.40)

        # Confidence: high — dealer flows are mechanistic and well-understood
        confidence = self._clamp(
            0.75 + abs(gamma_state) * 0.1 - vix_stress * 0.2,
            0.50, 0.95,
        )

        rationale = _build_rationale(spy, effective_gamma, squeeze_risk, vix_stress, vol_modifier)

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
                {"factor": "gamma exposure", "weight": 0.95},
                {"factor": "implied vol surface", "weight": 0.70},
                {"factor": "open interest concentration", "weight": 0.55},
            ],
        )


def _vol_regime_modifier(regime: VolatilityRegime) -> float:
    """Vol regime shifts effective gamma: negative = destabilizing pressure."""
    return {
        VolatilityRegime.COMPRESSED: 0.15,
        VolatilityRegime.NORMAL: 0.0,
        VolatilityRegime.ELEVATED: -0.20,
        VolatilityRegime.EXTREME: -0.45,
    }[regime]


def _build_rationale(spy, effective_gamma, squeeze_risk, vix_stress, vol_modifier) -> str:
    parts: list[str] = []

    if effective_gamma > 0.3:
        parts.append(f"Positive effective gamma ({effective_gamma:+.2f}); dealer hedging flows stabilizing market near current levels")
    elif effective_gamma < -0.3:
        parts.append(f"Negative effective gamma ({effective_gamma:+.2f}); dealer hedging amplifying directional moves")
    else:
        parts.append(f"Gamma near neutral ({effective_gamma:+.2f}); dealer flow impact minimal at current levels")

    if vol_modifier < -0.1:
        parts.append(f"Vol regime shifting dealer positioning unfavorably (modifier={vol_modifier:+.2f})")
    elif vol_modifier > 0.1:
        parts.append(f"Compressed vol supporting positive gamma environment")

    if squeeze_risk > 0.3:
        parts.append(f"Squeeze conditions detected (risk={squeeze_risk:.2f}); breakout could trigger rapid dealer repositioning")

    if vix_stress > 0.1:
        parts.append(f"VIX spike adding dealer stress; hedging flows becoming more destabilizing")

    if spy.gap_risk > 0.4:
        parts.append(f"Elevated gap risk ({spy.gap_risk:.2f}) could force dealer re-hedging at unfavorable levels")

    return ". ".join(parts)
