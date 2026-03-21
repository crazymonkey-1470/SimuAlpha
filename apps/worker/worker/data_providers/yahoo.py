"""Yahoo Finance market data provider.

Uses yfinance for convenient public-access daily OHLCV data.
Suitable for MVP and local development. For production, swap
this provider for Polygon, Tiingo, Alpaca, or similar.

Data is cached to local parquet files to avoid repeated API calls
and rate-limiting issues during development.
"""

from __future__ import annotations

import hashlib
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from worker.core.logging import get_logger
from worker.data_providers.base import MarketDataProvider

log = get_logger("data.yahoo")

# yfinance uses different ticker formats for some symbols
_TICKER_MAP = {
    "VIX": "^VIX",
}

_DEFAULT_CACHE_DIR = Path(".cache/market_data")


class YahooFinanceProvider(MarketDataProvider):
    """Fetches daily OHLCV from Yahoo Finance with local parquet caching."""

    def __init__(self, cache_dir: Path | str | None = None):
        self.cache_dir = Path(cache_dir) if cache_dir else _DEFAULT_CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def fetch_ohlcv(
        self,
        symbol: str,
        start: date,
        end: date,
    ) -> pd.DataFrame:
        """Fetch daily OHLCV for a single symbol, using cache if available."""
        cached = self._read_cache(symbol, start, end)
        if cached is not None:
            return cached

        yf_ticker = _TICKER_MAP.get(symbol, symbol)
        log.info("Fetching %s (%s) from Yahoo Finance: %s to %s", symbol, yf_ticker, start, end)

        try:
            import yfinance as yf

            # yfinance end date is exclusive, so add 1 day
            ticker = yf.Ticker(yf_ticker)
            df = ticker.history(
                start=start.isoformat(),
                end=(end + timedelta(days=1)).isoformat(),
                auto_adjust=True,
            )
        except Exception as exc:
            log.error("Failed to fetch %s: %s", symbol, exc)
            raise RuntimeError(f"Market data fetch failed for {symbol}: {exc}") from exc

        if df.empty:
            log.warning("No data returned for %s (%s to %s)", symbol, start, end)
            return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])

        df = self._normalize(df)
        self._write_cache(symbol, start, end, df)
        log.info("Fetched %d rows for %s", len(df), symbol)
        return df

    def fetch_multi(
        self,
        symbols: list[str],
        start: date,
        end: date,
    ) -> dict[str, pd.DataFrame]:
        """Fetch OHLCV for multiple symbols."""
        result: dict[str, pd.DataFrame] = {}
        for sym in symbols:
            result[sym] = self.fetch_ohlcv(sym, start, end)
        return result

    # ── Normalization ────────────────────────────────────────────────────

    @staticmethod
    def _normalize(df: pd.DataFrame) -> pd.DataFrame:
        """Normalize yfinance output to standard column names."""
        df = df.copy()

        # yfinance returns columns like 'Open', 'High', etc.
        df.columns = [c.lower().replace(" ", "_") for c in df.columns]

        # Keep only OHLCV columns
        keep = ["open", "high", "low", "close", "volume"]
        available = [c for c in keep if c in df.columns]
        df = df[available]

        # Ensure index is DatetimeIndex named 'date'
        df.index.name = "date"

        # Drop any rows with all NaN
        df = df.dropna(how="all")

        return df

    # ── Caching ──────────────────────────────────────────────────────────

    def _cache_key(self, symbol: str, start: date, end: date) -> str:
        raw = f"{symbol}_{start}_{end}"
        return hashlib.md5(raw.encode()).hexdigest()[:12]

    def _cache_path(self, symbol: str, start: date, end: date) -> Path:
        key = self._cache_key(symbol, start, end)
        return self.cache_dir / f"{symbol}_{key}.parquet"

    def _read_cache(self, symbol: str, start: date, end: date) -> pd.DataFrame | None:
        path = self._cache_path(symbol, start, end)
        if path.exists():
            try:
                df = pd.read_parquet(path)
                log.info("Cache hit for %s (%d rows)", symbol, len(df))
                return df
            except Exception:
                log.warning("Cache read failed for %s, will re-fetch", symbol)
                path.unlink(missing_ok=True)
        return None

    def _write_cache(self, symbol: str, start: date, end: date, df: pd.DataFrame) -> None:
        try:
            path = self._cache_path(symbol, start, end)
            df.to_parquet(path)
            log.info("Cached %s to %s", symbol, path)
        except Exception as exc:
            log.warning("Cache write failed for %s: %s", symbol, exc)
