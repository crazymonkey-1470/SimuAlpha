# TLI Scraper Service

Self-built financial data scraper. Replaces FMP, SerpAPI, Firecrawl.

## Railway Setup
1. New Service -> GitHub Repo -> SimuAlpha repo
2. Root Directory: scraper
3. Railway detects Dockerfile automatically
4. Health Check Path: /health
5. After deploy -> Settings -> Networking -> Private Networking
   Copy .railway.internal hostname
6. Add to Node backend Variables:
   SCRAPER_URL = http://{hostname}.railway.internal:8000

## Endpoints
- GET /health
- GET /universe/
- GET /historical/{ticker}
- GET /fundamentals/{ticker}
- DELETE /universe/cache

## Data Sources
- Universe: StockAnalysis.com -> SEC EDGAR fallback
- Historical: StockAnalysis.com -> Macrotrends fallback
- Fundamentals: StockAnalysis.com -> SEC EDGAR fallback

## Scraping Stack (4-tier fallback per source)
1. httpx (fastest)
2. curl_cffi (Cloudflare bypass)
3. Crawl4AI (JS rendering + AI extraction)
4. Playwright (full browser, last resort)
