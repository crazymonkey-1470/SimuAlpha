import asyncio
import time
from urllib.parse import urlparse

from fastapi import FastAPI
from dotenv import load_dotenv

from services.crawl_universe import fetch_universe
from services.crawl_historical import fetch_historical
from services.crawl_fundamentals import fetch_fundamentals

load_dotenv()

app = FastAPI(title="SimuAlpha Scraper", version="1.0.0")

# ── Rate limiter ────────────────────────────────────────────────

# Minimum seconds between requests to the same domain
DOMAIN_DELAYS: dict[str, float] = {
    "stockanalysis.com": 0.5,
    "macrotrends.net": 1.0,
    "finviz.com": 0.3,
    "sec.gov": 0.1,
}

_last_request_time: dict[str, float] = {}
_rate_lock = asyncio.Lock()


async def rate_limit(url: str) -> None:
    """Enforce minimum delay between requests to the same domain."""
    domain = urlparse(url).netloc.lower()
    # Match against known domains (handle subdomains like data.sec.gov)
    delay = 0.2  # default
    for pattern, d in DOMAIN_DELAYS.items():
        if pattern in domain:
            delay = d
            break

    async with _rate_lock:
        last = _last_request_time.get(domain, 0)
        elapsed = time.time() - last
        if elapsed < delay:
            await asyncio.sleep(delay - elapsed)
        _last_request_time[domain] = time.time()


# ── Endpoints ───────────────────────────────────────────────────


@app.get("/")
async def root():
    return {"service": "SimuAlpha Scraper", "status": "ok"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/universe")
async def get_universe():
    """Fetch the full stock universe (cached 24h)."""
    stocks = await fetch_universe()
    return {"count": len(stocks), "stocks": stocks}


@app.get("/historical/{ticker}")
async def get_historical(ticker: str):
    """Fetch historical prices for a ticker (cached 6h)."""
    print(f"Scraping {ticker} historical from available sources...")
    data = await fetch_historical(ticker)
    return data


@app.get("/fundamentals/{ticker}")
async def get_fundamentals(ticker: str):
    """Fetch fundamental data for a ticker (cached 6h)."""
    print(f"Scraping {ticker} fundamentals from available sources...")
    data = await fetch_fundamentals(ticker)
    return data


@app.get("/full/{ticker}")
async def get_full(ticker: str):
    """Fetch both historical and fundamental data for a ticker."""
    print(f"Scraping {ticker} full data from available sources...")
    historical, fundamentals = await asyncio.gather(
        fetch_historical(ticker),
        fetch_fundamentals(ticker),
    )
    return {
        "ticker": ticker.upper(),
        "historical": historical,
        "fundamentals": fundamentals,
    }
