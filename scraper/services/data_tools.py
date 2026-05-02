# Forked from TauricResearch/TradingAgents — Apache 2.0
"""
Simplified data tool access layer for SimuAlpha.
Wraps data_interface routing into easy-to-use functions.
"""

from .taconfig import get_config
from .data_interface import DataInterface

__all__ = [
    "get_stock_data",
    "get_indicators",
    "get_fundamentals",
    "get_balance_sheet",
    "get_cashflow",
    "get_income_statement",
    "get_news",
    "get_insider_transactions",
    "get_global_news",
    "build_instrument_context",
    "get_language_instruction",
]


def get_language_instruction() -> str:
    """Return a prompt instruction for the configured output language."""
    lang = get_config().get("output_language", "English")
    if lang.strip().lower() == "english":
        return ""
    return f" Write your entire response in {lang}."


def build_instrument_context(ticker: str) -> str:
    """Describe the exact instrument so agents preserve exchange-qualified tickers."""
    return (
        f"The instrument to analyze is `{ticker}`. "
        "Use this exact ticker in every tool call, report, and recommendation, "
        "preserving any exchange suffix (e.g. `.TO`, `.L`, `.HK`, `.T`)."
    )


def _get_data_interface():
    return DataInterface(config=get_config())


def get_stock_data(ticker: str, period: str = "6mo") -> dict:
    """Fetch historical stock data via yfinance."""
    return _get_data_interface().get_stock_data(ticker, period=period)


def get_indicators(ticker: str, period: str = "1y") -> dict:
    """Fetch technical indicators (MACD, RSI, etc.)."""
    return _get_data_interface().get_indicators(ticker, period=period)


def get_fundamentals(ticker: str) -> dict:
    """Fetch fundamental data (P/E, EPS, revenue, margins)."""
    return _get_data_interface().get_fundamentals(ticker)


def get_balance_sheet(ticker: str) -> dict:
    """Fetch balance sheet data."""
    return _get_data_interface().get_balance_sheet(ticker)


def get_cashflow(ticker: str) -> dict:
    """Fetch cash flow statement."""
    return _get_data_interface().get_cashflow(ticker)


def get_income_statement(ticker: str) -> dict:
    """Fetch income statement."""
    return _get_data_interface().get_income_statement(ticker)


def get_news(ticker: str, max_results: int = 10) -> list:
    """Fetch news for a ticker from yfinance."""
    return _get_data_interface().get_news(ticker, max_results=max_results)


def get_insider_transactions(ticker: str) -> list:
    """Fetch insider transaction data."""
    return []  # Placeholder — will wire up to SEC EDGAR later


def get_global_news(query: str = "", max_results: int = 10) -> list:
    """Fetch global news."""
    return _get_data_interface().get_news(query or "", max_results=max_results)
