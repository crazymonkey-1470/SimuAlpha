"""Market data provider abstraction for SimuAlpha.

Defines the interface for fetching historical OHLCV data.
Concrete implementations (YahooFinanceProvider, etc.) live alongside.
This abstraction allows swapping data sources without touching
feature engineering or simulation code.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date

import pandas as pd


class MarketDataProvider(ABC):
    """Abstract interface for historical market data sources."""

    @abstractmethod
    def fetch_ohlcv(
        self,
        symbol: str,
        start: date,
        end: date,
    ) -> pd.DataFrame:
        """Fetch daily OHLCV data for a single symbol.

        Returns a DataFrame with columns:
            date (index, datetime64), open, high, low, close, volume

        All prices adjusted for splits/dividends.
        Missing trading days (holidays) simply absent from the index.
        """
        ...

    @abstractmethod
    def fetch_multi(
        self,
        symbols: list[str],
        start: date,
        end: date,
    ) -> dict[str, pd.DataFrame]:
        """Fetch OHLCV for multiple symbols. Returns {symbol: DataFrame}."""
        ...
