from cache.store import universe_cache

CACHE_TTL = 86400  # 24 hours


async def get_universe() -> list[dict]:
    """Universe endpoint is no longer used — backend has hardcoded S&P 500.
    Kept for API compatibility."""
    cached = universe_cache.get("universe")
    if cached:
        return cached

    return []
