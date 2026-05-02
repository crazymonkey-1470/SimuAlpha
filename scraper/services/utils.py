# Forked from TauricResearch/TradingAgents — Apache 2.0
"""Shared utilities for data pipeline modules."""


def safe_ticker_component(ticker: str) -> str:
    """Convert ticker to a safe filesystem component."""
    return ticker.replace("^", "_").replace(".", "_").replace("/", "_")