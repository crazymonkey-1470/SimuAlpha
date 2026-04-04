from fastapi import APIRouter

from cache.store import universe_cache
from services.crawl_universe import get_universe

router = APIRouter()


@router.get("")
@router.get("/")
async def fetch_universe():
    data = await get_universe()
    return {"count": len(data), "stocks": data}


@router.delete("/cache")
async def clear_cache():
    universe_cache.clear()
    return {"message": "Universe cache cleared"}
