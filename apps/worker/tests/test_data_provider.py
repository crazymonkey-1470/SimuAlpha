"""Tests for market data provider (using mock data to avoid network calls)."""

from __future__ import annotations

from pathlib import Path
from datetime import date

import numpy as np
import pandas as pd

from worker.data_providers.yahoo import YahooFinanceProvider


class TestYahooProviderNormalization:
    def test_normalizes_columns(self):
        # Simulate yfinance-style DataFrame
        raw = pd.DataFrame({
            "Open": [100.0, 101.0],
            "High": [102.0, 103.0],
            "Low": [99.0, 100.0],
            "Close": [101.0, 102.0],
            "Volume": [1000000, 1100000],
            "Dividends": [0, 0],
            "Stock Splits": [0, 0],
        }, index=pd.to_datetime(["2024-01-02", "2024-01-03"]))
        raw.index.name = "Date"

        normalized = YahooFinanceProvider._normalize(raw)

        assert list(normalized.columns) == ["open", "high", "low", "close", "volume"]
        assert normalized.index.name == "date"
        assert len(normalized) == 2


class TestCaching:
    def test_cache_key_deterministic(self, tmp_path: Path):
        provider = YahooFinanceProvider(cache_dir=tmp_path)
        k1 = provider._cache_key("SPY", date(2024, 1, 1), date(2024, 6, 30))
        k2 = provider._cache_key("SPY", date(2024, 1, 1), date(2024, 6, 30))
        assert k1 == k2

    def test_cache_key_varies_by_symbol(self, tmp_path: Path):
        provider = YahooFinanceProvider(cache_dir=tmp_path)
        k1 = provider._cache_key("SPY", date(2024, 1, 1), date(2024, 6, 30))
        k2 = provider._cache_key("QQQ", date(2024, 1, 1), date(2024, 6, 30))
        assert k1 != k2

    def test_cache_roundtrip(self, tmp_path: Path):
        provider = YahooFinanceProvider(cache_dir=tmp_path)
        start, end = date(2024, 1, 1), date(2024, 6, 30)

        # Write cache
        df = pd.DataFrame({
            "open": [100.0],
            "high": [102.0],
            "low": [99.0],
            "close": [101.0],
            "volume": [1000000.0],
        }, index=pd.to_datetime(["2024-01-02"]))
        df.index.name = "date"
        provider._write_cache("SPY", start, end, df)

        # Read cache
        cached = provider._read_cache("SPY", start, end)
        assert cached is not None
        assert len(cached) == 1
        assert cached["close"].iloc[0] == 101.0
