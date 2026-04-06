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
    raw = await asyncio.gather(
        get_ticker_details(ticker),
        get_previous_close(ticker),
        get_week_52_high(ticker),
        get_financials(ticker),
        return_exceptions=True,
    )

    # Explicitly convert exceptions to None
    details = raw[0] if not isinstance(raw[0], BaseException) else None
    prev = raw[1] if not isinstance(raw[1], BaseException) else None
    week_52 = raw[2] if not isinstance(raw[2], BaseException) else None
    fin = raw[3] if not isinstance(raw[3], BaseException) else None

    # Log any exceptions
    for i, label in enumerate(["details", "prev_close", "52w_high", "financials"]):
        if isinstance(raw[i], BaseException):
            print(f"  [Fundamentals] {ticker} {label} error: {raw[i]}")

    # 1) Ticker details (company name, market cap, sector)
    if isinstance(details, dict):
        result["company_name"] = details.get("company_name")
        mc = details.get("market_cap")
        if isinstance(mc, (int, float)) and mc > 0:
            result["market_cap"] = mc
        result["sector"] = details.get("sector")
        result["source"] = "polygon"

    # 2) Previous close (current price)
    if isinstance(prev, dict):
        price = prev.get("current_price")
        if isinstance(price, (int, float)) and price > 0:
            result["current_price"] = float(price)
        result["source"] = result["source"] or "polygon"

    # 3) 52-week high
    if isinstance(week_52, (int, float)) and week_52 > 0:
        result["week_52_high"] = float(week_52)

    # 4) Financials (revenue) — validate types
    if isinstance(fin, dict):
        rev = fin.get("revenue_current")
        if isinstance(rev, (int, float)):
            result["revenue_current"] = float(rev)
        rev_prior = fin.get("revenue_prior_year")
        if isinstance(rev_prior, (int, float)):
            result["revenue_prior_year"] = float(rev_prior)
        growth = fin.get("revenue_growth_pct")
        if isinstance(growth, (int, float)):
            result["revenue_growth_pct"] = float(growth)
        result["source"] = result["source"] or "polygon"

    # P/S ratio: market_cap / revenue (both must be valid numbers)
    if (isinstance(result["market_cap"], (int, float))
            and isinstance(result["revenue_current"], (int, float))
            and result["revenue_current"] > 0):
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
