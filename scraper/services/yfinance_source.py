"""
yfinance-based data source — primary source for price and fundamental data.
All functions run yfinance synchronously in a ThreadPoolExecutor since
yfinance is not async-native. Every function returns None on failure.
"""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

# Suppress yfinance and urllib3 noise
logging.getLogger("yfinance").setLevel(logging.CRITICAL)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("peewee").setLevel(logging.WARNING)

_executor = ThreadPoolExecutor(max_workers=4)


async def get_historical_yfinance(ticker: str) -> dict | None:
    """Fetch 20yr monthly + 10yr weekly price history via yfinance."""
    try:
        return await asyncio.get_event_loop().run_in_executor(
            _executor, _fetch_historical_sync, ticker
        )
    except Exception:
        return None


def _fetch_historical_sync(ticker: str) -> dict | None:
    try:
        import yfinance as yf

        tk = yf.Ticker(ticker)

        # Monthly: max available (up to 20+ years)
        hist_monthly = tk.history(period="max", interval="1mo")
        monthly = []
        if hist_monthly is not None and not hist_monthly.empty:
            for idx, row in hist_monthly.iterrows():
                close = row.get("Close")
                if close is not None and close > 0:
                    date_str = idx.strftime("%Y-%m-%d")
                    monthly.append({"date": date_str, "close": round(float(close), 2)})

        # Weekly: 10 years
        hist_weekly = tk.history(period="10y", interval="1wk")
        weekly = []
        if hist_weekly is not None and not hist_weekly.empty:
            for idx, row in hist_weekly.iterrows():
                close = row.get("Close")
                if close is not None and close > 0:
                    date_str = idx.strftime("%Y-%m-%d")
                    weekly.append({"date": date_str, "close": round(float(close), 2)})

        if not monthly and not weekly:
            return None

        return {"ticker": ticker, "weekly": weekly, "monthly": monthly}
    except Exception:
        return None


async def get_quote_yfinance(ticker: str) -> dict | None:
    """Fetch current price, 52w high, market cap, P/E, P/S, name, sector."""
    try:
        return await asyncio.get_event_loop().run_in_executor(
            _executor, _fetch_quote_sync, ticker
        )
    except Exception:
        return None


def _fetch_quote_sync(ticker: str) -> dict | None:
    try:
        import yfinance as yf

        tk = yf.Ticker(ticker)
        info = tk.info or {}

        current_price = info.get("currentPrice") or info.get("regularMarketPrice")
        week_52_high = info.get("fiftyTwoWeekHigh")
        market_cap = info.get("marketCap")
        pe_ratio = info.get("trailingPE")
        ps_ratio = info.get("priceToSalesTrailing12Months")
        company_name = info.get("longName") or info.get("shortName")
        sector = info.get("sector")

        pct_from_52w_high = None
        if current_price and week_52_high and week_52_high > 0:
            pct_from_52w_high = round(
                (current_price - week_52_high) / week_52_high * 100, 2
            )

        if current_price is None:
            return None

        return {
            "current_price": float(current_price),
            "week_52_high": float(week_52_high) if week_52_high else None,
            "market_cap": float(market_cap) if market_cap else None,
            "pe_ratio": round(float(pe_ratio), 2) if pe_ratio else None,
            "ps_ratio": round(float(ps_ratio), 2) if ps_ratio else None,
            "company_name": company_name,
            "sector": sector,
            "pct_from_52w_high": pct_from_52w_high,
        }
    except Exception:
        return None


async def get_fundamentals_yfinance(ticker: str) -> dict | None:
    """Fetch revenue current/prior year from income_stmt, plus P/E and P/S."""
    try:
        return await asyncio.get_event_loop().run_in_executor(
            _executor, _fetch_fundamentals_sync, ticker
        )
    except Exception:
        return None


def _fetch_fundamentals_sync(ticker: str) -> dict | None:
    try:
        import yfinance as yf

        tk = yf.Ticker(ticker)

        revenue_current = None
        revenue_prior = None
        revenue_growth_pct = None

        # income_stmt columns are dates, most recent first
        income = tk.income_stmt
        if income is not None and not income.empty:
            # Look for TotalRevenue or Revenue row
            for row_label in income.index:
                label_lower = str(row_label).lower()
                if "total revenue" in label_lower or label_lower == "revenue":
                    cols = income.columns.tolist()
                    if len(cols) >= 2:
                        val_current = income.loc[row_label, cols[0]]
                        val_prior = income.loc[row_label, cols[1]]
                        if val_current is not None and val_prior is not None:
                            try:
                                revenue_current = float(val_current)
                                revenue_prior = float(val_prior)
                                if revenue_prior > 0:
                                    revenue_growth_pct = round(
                                        (revenue_current - revenue_prior)
                                        / revenue_prior
                                        * 100,
                                        2,
                                    )
                            except (ValueError, TypeError):
                                pass
                    break

        info = tk.info or {}
        pe_ratio = info.get("trailingPE")
        ps_ratio = info.get("priceToSalesTrailing12Months")

        if revenue_current is None and pe_ratio is None:
            return None

        return {
            "revenue_current": revenue_current,
            "revenue_prior_year": revenue_prior,
            "revenue_growth_pct": revenue_growth_pct,
            "pe_ratio": round(float(pe_ratio), 2) if pe_ratio else None,
            "ps_ratio": round(float(ps_ratio), 2) if ps_ratio else None,
        }
    except Exception:
        return None
