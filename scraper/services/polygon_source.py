"""
Polygon.io data source — primary source for all financial data.
Clean REST API, reliable, no scraping needed.
"""

import os
import asyncio
from datetime import datetime, timedelta

import httpx

API_KEY = os.environ.get("POLYGON_API_KEY", "")
BASE = "https://api.polygon.io"

# Rate limiting: Polygon free tier = 5 req/min
# We'll do 1 request per 1.5s to stay safe (40/min for paid tiers)
_last_call = 0.0
_lock = asyncio.Lock()

RATE_LIMIT_DELAY = float(os.environ.get("POLYGON_RATE_DELAY", "1.5"))


async def _rate_limit():
    global _last_call
    async with _lock:
        now = asyncio.get_event_loop().time()
        wait = RATE_LIMIT_DELAY - (now - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call = asyncio.get_event_loop().time()


async def _get(path: str, params: dict = None) -> dict | None:
    """Make a rate-limited GET request to Polygon API."""
    if not API_KEY:
        print("  [Polygon] POLYGON_API_KEY not set!")
        return None

    await _rate_limit()

    url = f"{BASE}{path}"
    if params is None:
        params = {}
    params["apiKey"] = API_KEY

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, params=params)
            if r.status_code == 200:
                return r.json()
            elif r.status_code == 429:
                print(f"  [Polygon] Rate limited, waiting 60s...")
                await asyncio.sleep(60)
                # Retry once
                r = await client.get(url, params=params)
                if r.status_code == 200:
                    return r.json()
            print(f"  [Polygon] {path} returned {r.status_code}")
            return None
    except Exception as e:
        print(f"  [Polygon] {path} error: {e}")
        return None


async def get_ticker_details(ticker: str) -> dict | None:
    """Get company details: name, market_cap, sector, etc.
    Endpoint: GET /v3/reference/tickers/{ticker}
    """
    data = await _get(f"/v3/reference/tickers/{ticker}")
    if not data or data.get("status") != "OK":
        return None

    results = data.get("results", {})
    return {
        "company_name": results.get("name"),
        "market_cap": results.get("market_cap"),
        "sector": results.get("sic_description"),  # closest to sector
        "primary_exchange": results.get("primary_exchange"),
        "type": results.get("type"),
        "currency": results.get("currency_name"),
    }


async def get_previous_close(ticker: str) -> dict | None:
    """Get most recent closing price.
    Endpoint: GET /v2/aggs/ticker/{ticker}/prev
    """
    data = await _get(f"/v2/aggs/ticker/{ticker}/prev")
    if not data or data.get("resultsCount", 0) == 0:
        return None

    result = data["results"][0]
    return {
        "current_price": result.get("c"),  # close
        "open": result.get("o"),
        "high": result.get("h"),
        "low": result.get("l"),
        "volume": result.get("v"),
    }


async def get_financials(ticker: str) -> dict | None:
    """Get financial statements (revenue, etc).
    Endpoint: GET /vX/reference/financials
    """
    data = await _get(
        "/vX/reference/financials",
        {
            "ticker": ticker,
            "timeframe": "annual",
            "order": "desc",
            "limit": 2,
            "sort": "filing_date",
        },
    )
    if not data or not data.get("results"):
        return None

    results = data["results"]

    revenue_current = None
    revenue_prior = None
    revenue_growth_pct = None
    pe_ratio = None
    ps_ratio = None

    # Extract revenue from income statement
    if len(results) >= 1:
        income = results[0].get("financials", {}).get("income_statement", {})
        revenues = income.get("revenues", {})
        revenue_current = revenues.get("value")

        # EPS for P/E calculation
        eps_data = income.get("basic_earnings_per_share", {})
        eps = eps_data.get("value")

    if len(results) >= 2:
        income_prior = results[1].get("financials", {}).get("income_statement", {})
        revenues_prior = income_prior.get("revenues", {})
        revenue_prior = revenues_prior.get("value")

        if revenue_current is not None and revenue_prior is not None and revenue_prior > 0:
            revenue_growth_pct = round(
                (revenue_current - revenue_prior) / revenue_prior * 100, 2
            )

    return {
        "revenue_current": revenue_current,
        "revenue_prior_year": revenue_prior,
        "revenue_growth_pct": revenue_growth_pct,
    }


async def get_week_52_high(ticker: str) -> float | None:
    """Calculate 52-week high from daily aggregates.
    Endpoint: GET /v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}
    """
    to_date = datetime.now().strftime("%Y-%m-%d")
    from_date = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")

    data = await _get(
        f"/v2/aggs/ticker/{ticker}/range/1/day/{from_date}/{to_date}",
        {"adjusted": "true", "sort": "desc", "limit": 300},
    )
    if not data or not data.get("results"):
        return None

    highs = [r["h"] for r in data["results"] if r.get("h")]
    return max(highs) if highs else None


async def get_historical_prices(ticker: str) -> dict | None:
    """Get weekly (10yr) and monthly (20yr) price history.
    Returns: {"ticker": str, "weekly": [...], "monthly": [...]}
    """
    result = {"ticker": ticker, "weekly": [], "monthly": []}

    # Weekly: 10 years
    to_date = datetime.now().strftime("%Y-%m-%d")
    from_weekly = (datetime.now() - timedelta(days=365 * 10)).strftime("%Y-%m-%d")

    weekly_data = await _get(
        f"/v2/aggs/ticker/{ticker}/range/1/week/{from_weekly}/{to_date}",
        {"adjusted": "true", "sort": "asc", "limit": 50000},
    )
    if weekly_data and weekly_data.get("results"):
        for bar in weekly_data["results"]:
            if bar.get("c") and bar.get("t"):
                dt = datetime.fromtimestamp(bar["t"] / 1000)
                result["weekly"].append({
                    "date": dt.strftime("%Y-%m-%d"),
                    "close": round(float(bar["c"]), 2),
                })

    # Monthly: 20 years
    from_monthly = (datetime.now() - timedelta(days=365 * 20)).strftime("%Y-%m-%d")

    monthly_data = await _get(
        f"/v2/aggs/ticker/{ticker}/range/1/month/{from_monthly}/{to_date}",
        {"adjusted": "true", "sort": "asc", "limit": 50000},
    )
    if monthly_data and monthly_data.get("results"):
        for bar in monthly_data["results"]:
            if bar.get("c") and bar.get("t"):
                dt = datetime.fromtimestamp(bar["t"] / 1000)
                result["monthly"].append({
                    "date": dt.strftime("%Y-%m-%d"),
                    "close": round(float(bar["c"]), 2),
                })

    if not result["weekly"] and not result["monthly"]:
        return None

    return result
