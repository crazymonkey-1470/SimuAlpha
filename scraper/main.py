import os
os.environ["NO_COLOR"] = "1"
os.environ["TERM"] = "dumb"

import logging
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("crawl4ai").setLevel(logging.WARNING)
logging.getLogger("playwright").setLevel(logging.WARNING)

from fastapi import FastAPI

from routes import fundamentals, historical, universe

app = FastAPI(
    title="TLI Scraper Service",
    description="Self-built financial data scraper. No paid APIs.",
    version="1.0.0",
    redirect_slashes=False,
)

app.include_router(universe.router, prefix="/universe", tags=["Universe"])
app.include_router(historical.router, prefix="/historical", tags=["Historical"])
app.include_router(fundamentals.router, prefix="/fundamentals", tags=["Fundamentals"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "TLI Scraper"}


@app.get("/")
def root():
    return {
        "service": "TLI Scraper Platform",
        "version": "1.0.0",
        "endpoints": {
            "universe": "/universe/",
            "historical": "/historical/{ticker}",
            "fundamentals": "/fundamentals/{ticker}",
            "health": "/health",
        },
    }
