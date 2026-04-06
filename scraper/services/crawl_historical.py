from .polygon_source import get_historical_prices
from cache.store import historical_cache

CACHE_TTL = 86400  # 24 hours


async def get_historical(ticker: str) -> dict:
    cached = historical_cache.get(f"hist_{ticker}")
    if cached:
        return cached

    result = await get_historical_prices(ticker)

    if result is None:
        print(f"  [Historical] {ticker}: no data from Polygon")
        return {"ticker": ticker, "weekly": [], "monthly": []}

    weekly_count = len(result.get("weekly", []))
    monthly_count = len(result.get("monthly", []))
    print(f"  [Historical] {ticker}: {weekly_count} weekly, {monthly_count} monthly bars")

    if weekly_count > 0 or monthly_count > 0:
        historical_cache.set(f"hist_{ticker}", result, CACHE_TTL)

    return result
