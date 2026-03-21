"""MacroNewsAgent — macro/news-reactive actor.

Models the behavior of discretionary macro funds and news-reactive
participants who adjust positioning based on macro regime shifts,
rate expectations, and event risk.

Reacts to:
- Macro event risk level
- Yield change proxy (rate expectations)
- Sentiment shifts
- TLT behavior (bond market confirmation)
- Risk-on / risk-off pressure

Logic:
- Rising rates + high event risk → bearish (risk-off)
- Falling rates + low event risk → bullish (risk-on)
- Extreme sentiment readings are contrarian signals
- TLT behavior confirms or refutes macro thesis
- High event risk alone increases conviction in defensive posture
"""

from __future__ import annotations

from worker.engine.agents.base import AgentOutput, BaseAgent
from worker.engine.market_state import MarketSnapshot


class MacroNewsAgent(BaseAgent):
    agent_id = "actor-mn-01"
    agent_name = "Macro/News-Reactive Agents"
    archetype = "macro_reactive"
    horizon = "event-driven, 1-10 days"

    def evaluate(self, snapshot: MarketSnapshot) -> AgentOutput:
        spy = snapshot.states["SPY"]
        tlt = snapshot.states.get("TLT")

        # ── Rate pressure signal ─────────────────────────────────────────
        # Positive yield_change = rates rising = headwind for equities
        rate_signal = -spy.yield_change_proxy / 10.0  # Normalize: +10bps → -1.0 signal
        rate_signal = max(-1, min(1, rate_signal))

        # ── Event risk assessment ────────────────────────────────────────
        event_risk = spy.macro_event_risk  # 0 to 1

        # High event risk biases toward caution
        event_bias = -event_risk * 0.4  # Up to -0.4 bearish pressure

        # ── Sentiment signal ─────────────────────────────────────────────
        # Extreme sentiment is contrarian; moderate sentiment is confirming
        sentiment = spy.sentiment_score
        if abs(sentiment) > 0.7:
            # Contrarian: extreme greed → bearish warning, extreme fear → bullish
            sentiment_signal = -sentiment * 0.3
        else:
            # Confirming: moderate positive sentiment → mildly supportive
            sentiment_signal = sentiment * 0.15

        # ── TLT confirmation ─────────────────────────────────────────────
        # If bonds are rallying (TLT up) while equities fall → macro risk-off confirmed
        # If bonds are selling off with equities → rate-driven repricing
        tlt_signal = 0.0
        if tlt:
            if tlt.return_1d > 0.003 and spy.return_1d < -0.003:
                tlt_signal = -0.2  # Classic risk-off: bonds up, equities down
            elif tlt.return_1d < -0.003 and spy.return_1d < -0.003:
                tlt_signal = -0.15  # Both down: rate-driven liquidation
            elif tlt.return_1d < -0.003 and spy.return_1d > 0.003:
                tlt_signal = 0.1  # Rotation from bonds to equities

        # ── Composite macro signal ──────────────────────────────────────
        macro_signal = (
            0.35 * rate_signal
            + 0.25 * event_bias
            + 0.20 * sentiment_signal
            + 0.20 * tlt_signal
        )

        # ── Compute outputs ─────────────────────────────────────────────
        bias = self._classify_bias(macro_signal, threshold=0.10)

        # Conviction: scales with event risk and signal magnitude
        conviction = self._clamp(
            abs(macro_signal) * 0.6
            + event_risk * 0.35,
            0.10, 0.90,
        )

        # Contribution: macro agents can have significant impact during events
        direction = 1.0 if macro_signal > 0 else (-1.0 if macro_signal < 0 else 0.0)
        contribution = self._clamp(direction * conviction * 0.5, -0.40, 0.40)

        # Confidence: lower during high uncertainty (event risk reduces clarity)
        confidence = self._clamp(
            0.65
            + abs(macro_signal) * 0.2
            - event_risk * 0.25,  # More event risk = less confidence in any view
            0.25, 0.85,
        )

        rationale = _build_rationale(spy, tlt, rate_signal, event_risk, sentiment, tlt_signal, macro_signal, bias)

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
                {"factor": "rate expectations", "weight": 0.80},
                {"factor": "geopolitical risk index", "weight": 0.50},
                {"factor": "earnings surprise", "weight": 0.65},
            ],
        )


def _build_rationale(spy, tlt, rate_signal, event_risk, sentiment, tlt_signal, macro_signal, bias) -> str:
    parts: list[str] = []

    # Rate assessment
    if abs(spy.yield_change_proxy) > 3:
        direction = "rising" if spy.yield_change_proxy > 0 else "falling"
        parts.append(f"Rates {direction} ({spy.yield_change_proxy:+.1f}bps); {'headwind' if spy.yield_change_proxy > 0 else 'tailwind'} for risk assets")
    else:
        parts.append(f"Rate environment stable ({spy.yield_change_proxy:+.1f}bps); limited macro impulse from fixed income")

    # Event risk
    if event_risk > 0.5:
        parts.append(f"Elevated macro event risk ({event_risk:.2f}) driving defensive positioning")
    elif event_risk > 0.25:
        parts.append(f"Moderate event risk present ({event_risk:.2f}); maintaining hedged posture")

    # Sentiment
    if sentiment > 0.6:
        parts.append(f"Extreme bullish sentiment ({sentiment:.2f}) raises contrarian concern")
    elif sentiment < -0.6:
        parts.append(f"Extreme bearish sentiment ({sentiment:.2f}) suggests capitulation opportunity")

    # TLT
    if tlt and tlt_signal != 0:
        if tlt_signal < -0.15:
            parts.append(f"Bond market confirming risk-off (TLT {tlt.return_1d:+.2%})")
        elif tlt_signal > 0:
            parts.append(f"Rotation from bonds to equities in progress")

    # Summary
    if not parts:
        parts.append("Macro backdrop benign; no strong directional impulse from macro factors")

    return ". ".join(parts)
