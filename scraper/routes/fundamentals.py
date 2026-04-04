from fastapi import APIRouter

from services.crawl_fundamentals import get_fundamentals

router = APIRouter()


@router.get("/{ticker}")
async def fetch_fundamentals(ticker: str):
    return await get_fundamentals(ticker.upper())
