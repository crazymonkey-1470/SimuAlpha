import os
os.environ["NO_COLOR"] = "1"
os.environ["TERM"] = "dumb"

import logging
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

from fastapi import FastAPI

from routes import fundamentals, historical, universe

app = FastAPI(
    title="TLI Scraper Service",
    description="Financial data via Polygon.io API.",
    version="2.0.0",
    redirect_slashes=False,
)

app.include_router(universe.router, prefix="/universe", tags=["Universe"])
app.include_router(historical.router, prefix="/historical", tags=["Historical"])
app.include_router(fundamentals.router, prefix="/fundamentals", tags=["Fundamentals"])


@app.get("/health")
def health():
    has_key = bool(os.environ.get("POLYGON_API_KEY"))
    return {"status": "ok", "service": "TLI Scraper", "polygon_key_set": has_key}


@app.get("/")
def root():
    return {
        "service": "TLI Scraper Platform",
        "version": "2.0.0",
        "data_source": "Polygon.io",
        "endpoints": {
            "universe": "/universe/",
            "historical": "/historical/{ticker}",
            "fundamentals": "/fundamentals/{ticker}",
            "health": "/health",
        },
    }
