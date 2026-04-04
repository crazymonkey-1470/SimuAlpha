import time

from crawl4ai import AsyncWebCrawler

from .scrape_utils import fetch_html, parse_html

# Per-ticker cache: { "AAPL": {"data": {...}, "fetched_at": ts} }
_cache: dict = {}
_CACHE_TTL = 6 * 60 * 60  # 6 hours


def _parse_price_table(html: str) -> list[dict]:
    """Extract date/close rows from a standard price history table."""
    soup = parse_html(html)
    table = soup.select_one("table")
    if not table:
        return []

    rows = []
    for tr in table.select("tbody tr"):
        cells = tr.select("td")
        if len(cells) < 2:
            continue
        date_text = cells[0].get_text(strip=True)
        close_text = cells[-2].get_text(strip=True).replace("$", "").replace(",", "")
        try:
            close = float(close_text)
            rows.append({"date": date_text, "close": close})
        except (ValueError, TypeError):
            continue

    return rows


def _split_weekly_monthly(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    Given daily/mixed rows sorted by date descending, produce weekly and monthly series.
    Weekly: one point per ~7 days (take first of each ISO week).
    Monthly: one point per month (take first of each month).
    """
    if not rows:
        return [], []

    monthly = []
    weekly = []
    seen_months: set[str] = set()
    seen_weeks: set[str] = set()

    for row in rows:
        d = row["date"]
        # Monthly: use YYYY-MM
        month_key = d[:7] if len(d) >= 7 else d
        if month_key not in seen_months:
            seen_months.add(month_key)
            monthly.append(row)

        # Weekly: use YYYY-MM-DD bucketed to ~7 day windows
        week_key = d[:10] if len(d) >= 10 else d
        if week_key not in seen_weeks:
            seen_weeks.add(week_key)
            weekly.append(row)

    return weekly, monthly


def _interpolate_weekly_from_monthly(monthly: list[dict]) -> list[dict]:
    """Approximate weekly data from monthly closes via linear interpolation."""
    if len(monthly) < 2:
        return monthly

    weekly = []
    for i in range(len(monthly) - 1):
        start = monthly[i]["close"]
        end = monthly[i + 1]["close"]
        date = monthly[i]["date"]
        # ~4 weeks per month
        for w in range(4):
            frac = w / 4
            interpolated = start + (end - start) * frac
            weekly.append({"date": f"{date}_w{w}", "close": round(interpolated, 2)})
    # Add last month
    weekly.append(monthly[-1])
    return weekly


async def _fetch_stockanalysis(ticker: str) -> list[dict] | None:
    """SOURCE 1: StockAnalysis.com history page."""
    url = f"https://stockanalysis.com/stocks/{ticker.lower()}/history/?p=monthly"
    html = await fetch_html(url)
    if not html:
        return None

    rows = _parse_price_table(html)
    return rows if rows else None


async def _fetch_macrotrends(ticker: str) -> list[dict] | None:
    """SOURCE 2: Macrotrends (needs JS rendering, use Crawl4AI directly)."""
    # Macrotrends URL uses lowercase ticker and company name slug.
    # We'll try the common pattern; the redirect usually handles it.
    url = f"https://www.macrotrends.net/stocks/charts/{ticker.upper()}/{ticker.lower()}/stock-price-history"
    try:
        async with AsyncWebCrawler(verbose=False) as crawler:
            result = await crawler.arun(url=url)
            if not result.success or not result.html:
                return None
            return _parse_price_table(result.html)
    except Exception as e:
        print(f"Macrotrends Crawl4AI failed for {ticker}: {e}")
        return None


async def fetch_historical(ticker: str) -> dict:
    """
    Fetch historical price data with 2-source fallback.
    Returns:
    {
        "ticker": "NVO",
        "weekly": [{"date": "2024-01-05", "close": 98.50}, ...],
        "monthly": [{"date": "2024-01-01", "close": 97.20}, ...]
    }
    Caches per ticker for 6 hours.
    """
    ticker = ticker.upper().strip()
    now = time.time()

    cached = _cache.get(ticker)
    if cached and (now - cached.get("fetched_at", 0)) < _CACHE_TTL:
        print(f"Historical {ticker}: loaded from cache")
        return cached["data"]

    rows = None
    source = "none"

    # SOURCE 1: StockAnalysis
    rows = await _fetch_stockanalysis(ticker)
    if rows:
        source = "StockAnalysis"

    # SOURCE 2: Macrotrends
    if not rows:
        rows = await _fetch_macrotrends(ticker)
        if rows:
            source = "Macrotrends"

    if not rows:
        print(f"Historical {ticker}: all sources failed")
        return {"ticker": ticker, "weekly": [], "monthly": []}

    weekly, monthly = _split_weekly_monthly(rows)

    # If only monthly data available, interpolate weekly
    if len(weekly) < 60 and len(monthly) >= 12:
        weekly = _interpolate_weekly_from_monthly(monthly)

    result = {
        "ticker": ticker,
        "weekly": weekly,
        "monthly": monthly,
    }

    _cache[ticker] = {"data": result, "fetched_at": now}

    print(
        f"Historical {ticker}: {len(monthly)} monthly, {len(weekly)} weekly "
        f"data points from {source}"
    )

    return result
