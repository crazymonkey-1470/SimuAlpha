# Forked from TauricResearch/TradingAgents — Apache 2.0
"""TypedDict definitions backing the debate-graph state.

Shape derived from the actual usage sites — every field referenced by
``quant/graph/{conditional_logic,propagation,signal_processing}.py`` and
the bull/bear/risk node factories under ``quant/agents/`` is enumerated
here. If any node reads a key that isn't listed below, this is the
file to update.

Pure stdlib — no LangGraph, no LangChain. The forked debate code reads
state via dict subscription (``state["messages"]``), so a TypedDict is
sufficient: the runtime object is a plain ``dict`` that the consumer
sees as the structured contract below.
"""

from __future__ import annotations

from typing import Any, List, Optional, Tuple, TypedDict


class InvestDebateState(TypedDict):
    """State threaded through the bull-vs-bear research debate."""

    bull_history: str
    bear_history: str
    history: str
    current_response: str
    judge_decision: str
    count: int


class RiskDebateState(TypedDict):
    """State threaded through the 3-way risk panel debate."""

    aggressive_history: str
    conservative_history: str
    neutral_history: str
    history: str
    latest_speaker: str
    current_aggressive_response: str
    current_conservative_response: str
    current_neutral_response: str
    judge_decision: str
    count: int


class AgentState(TypedDict, total=False):
    """Top-level state object that flows through the agent graph.

    ``total=False`` because not every node populates every field — the
    market analyst writes ``market_report``, the news analyst writes
    ``news_report``, etc. The conditional-logic node only ever reads
    keys that have been written by an upstream node, so missing keys
    are not an error in practice.
    """

    # Conversation transcript — list of (role, content) tuples or
    # LangChain-shaped message objects with ``.tool_calls``.
    messages: List[Any]

    # Inputs.
    company_of_interest: str
    trade_date: str
    past_context: str

    # Per-channel analyst reports. Empty string until the analyst node fires.
    market_report: str
    sentiment_report: str
    news_report: str
    fundamentals_report: str

    # Debate state objects.
    investment_debate_state: InvestDebateState
    risk_debate_state: RiskDebateState

    # Final outputs.
    investment_plan: Optional[str]
    trader_investment_plan: Optional[str]
    final_trade_decision: Optional[str]
