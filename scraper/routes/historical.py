from fastapi import APIRouter

from services.crawl_historical import get_historical

router = APIRouter()


@router.get("/{ticker}")
async def fetch_historical(ticker: str):
    return await get_historical(ticker.upper())
