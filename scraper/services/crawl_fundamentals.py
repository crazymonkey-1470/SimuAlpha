import asyncio

from .polygon_source import get_ticker_details, get_previous_close, get_financials, get_week_52_high
from cache.store import fundamentals_cache

CACHE_TTL = 86400  # 24 hours


async def get_fundamentals(ticker: str) -> dict:
    cached = fundamentals_cache.get(f"fund_{ticker}")
    if cached:
        return cached

    result = {
        "ticker": ticker,
        "company_name": None,
        "market_cap": None,
        "current_price": None,
        "week_52_high": None,
        "revenue_current": None,
        "revenue_prior_year": None,
        "revenue_growth_pct": None,
        "pe_ratio": None,
        "ps_ratio": None,
        "debt_to_equity": None,
        "current_ratio": None,
        "free_cash_flow": None,
        "gross_margin": None,
        "sector": None,
        "source": None,
    }

    # Run all 4 Polygon calls concurrently (rate limiter serializes them,
    # but this avoids wasted time between calls)
    details, prev, week_52, fin = await asyncio.gather(
        get_ticker_details(ticker),
        get_previous_close(ticker),
        get_week_52_high(ticker),
        get_financials(ticker),
        return_exceptions=True,
    )

    # 1) Ticker details (company name, market cap, sector)
    if isinstance(details, dict):
        result["company_name"] = details.get("company_name")
        result["market_cap"] = details.get("market_cap")
        result["sector"] = details.get("sector")
        result["source"] = "polygon"

    # 2) Previous close (current price)
    if isinstance(prev, dict):
        result["current_price"] = prev.get("current_price")
        result["source"] = result["source"] or "polygon"

    # 3) 52-week high
    if isinstance(week_52, (int, float)):
        result["week_52_high"] = week_52

    # 4) Financials (revenue)
    if isinstance(fin, dict):
        result["revenue_current"] = fin.get("revenue_current")
        result["revenue_prior_year"] = fin.get("revenue_prior_year")
        result["revenue_growth_pct"] = fin.get("revenue_growth_pct")
        result["source"] = result["source"] or "polygon"

    # P/S ratio: market_cap / revenue
    if result["market_cap"] and result["revenue_current"] and result["revenue_current"] > 0:
        result["ps_ratio"] = round(result["market_cap"] / result["revenue_current"], 2)

    # Cache strategy: full data = 24h, partial = 1h, nothing = skip
    has_price = result["current_price"] is not None
    has_revenue = result["revenue_current"] is not None
    if has_price and has_revenue:
        fundamentals_cache.set(f"fund_{ticker}", result, CACHE_TTL)
    elif has_price or has_revenue:
        fundamentals_cache.set(f"fund_{ticker}", result, 3600)

    fields_filled = sum(1 for v in result.values() if v is not None)
    print(f"  [Fundamentals] {ticker}: {fields_filled}/16 fields filled (source={result['source']})")

    return result
