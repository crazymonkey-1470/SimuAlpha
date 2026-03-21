"""Base agent interface for SimuAlpha actor classes.

Every agent takes a MarketSnapshot and produces an AgentOutput.
The logic must be transparent and deterministic — no hidden randomness.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from pydantic import BaseModel, Field

from worker.engine.market_state import MarketSnapshot


class AgentOutput(BaseModel):
    """Structured output from a single agent evaluation."""

    agent_id: str
    agent_name: str
    archetype: str
    bias: str = Field(description="bullish, bearish, or neutral")
    conviction: float = Field(ge=0, le=1, description="Strength of directional view")
    contribution: float = Field(ge=-1, le=1, description="Net pressure contribution")
    confidence: float = Field(ge=0, le=1, description="Confidence in own state estimate")
    horizon: str = Field(description="Operating time horizon")
    rationale: str = Field(description="Transparent explanation of current state")
    sensitivities: list[dict] = Field(default_factory=list, description="Key factor sensitivities")


class BaseAgent(ABC):
    """Abstract base for all SimuAlpha actor agents."""

    agent_id: str
    agent_name: str
    archetype: str
    horizon: str

    @abstractmethod
    def evaluate(self, snapshot: MarketSnapshot) -> AgentOutput:
        """Evaluate the current market snapshot and produce an output."""
        ...

    def _classify_bias(self, score: float, threshold: float = 0.15) -> str:
        if score > threshold:
            return "bullish"
        elif score < -threshold:
            return "bearish"
        return "neutral"

    def _clamp(self, v: float, lo: float = 0.0, hi: float = 1.0) -> float:
        return max(lo, min(hi, v))
