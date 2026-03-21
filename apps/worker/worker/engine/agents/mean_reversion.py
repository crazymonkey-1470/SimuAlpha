"""MeanReversionAgent — statistical mean-reversion actor.

Reacts to:
- Stretched short-term moves (return_1d, return_5d)
- Mean reversion score (overbought/oversold)
- Volume spikes (capitulation signals)
- Volatility spikes (snapback conditions)

Logic:
- Fades stretched moves: buys oversold, sells overbought
- Conviction highest when move is large AND volume confirms capitulation
- Reduces conviction in strong trending environments (don't fade a trend)
- Higher confidence when realized vol is elevated (more reversion opportunity)
"""

from __future__ import annotations

from worker.engine.agents.base import AgentOutput, BaseAgent
from worker.engine.market_state import MarketSnapshot, VolatilityRegime


class MeanReversionAgent(BaseAgent):
    agent_id = "actor-mr-01"
    agent_name = "Statistical Mean Reverters"
    archetype = "mean_reverter"
    horizon = "1-5 days"

    def evaluate(self, snapshot: MarketSnapshot) -> AgentOutput:
        spy = snapshot.states["SPY"]

        # ── Core signal: mean reversion score ────────────────────────────
        # Positive = oversold (buy signal), negative = overbought (sell signal)
        mr_signal = spy.mean_reversion_score

        # ── Stretch detection ────────────────────────────────────────────
        # How far has the market moved in the short term?
        short_stretch = abs(spy.return_1d) / max(0.001, spy.realized_vol / 15.87)  # daily vol
        week_stretch = abs(spy.return_5d) / max(0.001, spy.realized_vol / 7.07)  # sqrt(5)-day vol

        stretch_magnitude = max(short_stretch, week_stretch)

        # ── Volume confirmation ──────────────────────────────────────────
        # High volume on the stretched move suggests capitulation → better reversion setup
        volume_boost = 0.0
        if spy.volume_zscore > 1.5 and stretch_magnitude > 1.0:
            volume_boost = min(0.15, (spy.volume_zscore - 1.5) * 0.05)

        # ── Trend penalty ────────────────────────────────────────────────
        # If a strong trend exists, fading it is dangerous
        trend_penalty = 0.0
        trend_aligned_with_move = (spy.trend_strength > 0.3 and spy.return_5d > 0) or \
                                  (spy.trend_strength < -0.3 and spy.return_5d < 0)
        if trend_aligned_with_move:
            trend_penalty = min(0.4, abs(spy.trend_strength) * 0.5)

        # ── Compute outputs ─────────────────────────────────────────────
        # Conviction: proportional to stretch, boosted by volume, penalized by trend
        raw_conviction = (
            min(1.0, stretch_magnitude * 0.3)
            + abs(mr_signal) * 0.4
            + volume_boost
            - trend_penalty
        )
        conviction = self._clamp(raw_conviction, 0.05, 0.90)

        # Bias: opposite of the recent move (we fade it)
        # mr_signal > 0 means oversold → bullish, mr_signal < 0 → bearish
        bias = self._classify_bias(mr_signal, threshold=0.10)

        # Contribution: modest — mean reverters provide stabilization, not trend force
        direction = 1.0 if mr_signal > 0 else (-1.0 if mr_signal < 0 else 0.0)
        contribution = self._clamp(direction * conviction * 0.35, -0.30, 0.30)

        # Confidence: higher when setup is clean (stretched + volume + no opposing trend)
        confidence = self._clamp(
            0.60
            + 0.15 * min(1, stretch_magnitude / 2.0)
            + volume_boost
            - trend_penalty * 0.5,
            0.30, 0.95,
        )

        rationale = _build_rationale(spy, mr_signal, stretch_magnitude, volume_boost, trend_penalty, bias)

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
                {"factor": "deviation from VWAP", "weight": 0.90},
                {"factor": "order book imbalance", "weight": 0.60},
            ],
        )


def _build_rationale(spy, mr_signal, stretch, volume_boost, trend_penalty, bias) -> str:
    parts: list[str] = []

    if stretch > 1.5:
        direction = "downside" if spy.return_5d < 0 else "upside"
        parts.append(f"Market stretched to the {direction} ({spy.return_5d:+.2%} over 5d, stretch={stretch:.1f}σ)")
    elif stretch > 0.8:
        parts.append(f"Moderate extension detected (5d return {spy.return_5d:+.2%})")
    else:
        parts.append(f"No significant deviation from fair value; positioning neutral")

    if abs(mr_signal) > 0.3:
        condition = "oversold" if mr_signal > 0 else "overbought"
        parts.append(f"Mean reversion score indicates {condition} conditions ({mr_signal:+.2f})")

    if volume_boost > 0:
        parts.append(f"Elevated volume (z={spy.volume_zscore:.1f}) suggests capitulation; reversion setup strengthened")

    if trend_penalty > 0.15:
        parts.append(f"Strong underlying trend (strength={spy.trend_strength:.2f}) reduces conviction for fading")
    elif trend_penalty > 0:
        parts.append(f"Modest trend present; minor penalty applied to reversion thesis")

    if not parts:
        parts.append("Neutral positioning; no actionable deviation detected")

    return ". ".join(parts)
