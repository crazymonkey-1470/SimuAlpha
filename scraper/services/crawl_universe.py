import re
import time

import httpx

from .scrape_utils import fetch_html, parse_html

# Module-level cache: {"stocks": [...], "fetched_at": timestamp}
_cache: dict = {}
_CACHE_TTL = 24 * 60 * 60  # 24 hours

# Patterns for warrants and special-purpose tickers
_EXCLUDE_SUFFIX = re.compile(r"(\d+|[WRTU])$")


def _is_valid_ticker(ticker: str) -> bool:
    """Filter out warrants, units, rights, and numeric suffixes."""
    if not ticker or not ticker.isascii():
        return False
    return _EXCLUDE_SUFFIX.search(ticker) is None


def _apply_filters(stocks: list[dict]) -> list[dict]:
    """Apply standard universe filters."""
    filtered = []
    for s in stocks:
        ticker = (s.get("ticker") or "").upper().strip()
        if not _is_valid_ticker(ticker):
            continue
        price = s.get("price")
        if price is not None and price <= 2:
            continue
        exchange = (s.get("exchange") or "").upper()
        if exchange and exchange not in ("NYSE", "NASDAQ", "AMEX", ""):
            continue
        s["ticker"] = ticker
        filtered.append(s)
    return filtered


async def _fetch_stockanalysis() -> list[dict] | None:
    """SOURCE 1: StockAnalysis.com stock list."""
    url = "https://stockanalysis.com/stocks/"
    html = await fetch_html(url)
    if not html:
        return None

    soup = parse_html(html)
    table = soup.select_one("table")
    if not table:
        return None

    stocks = []
    rows = table.select("tbody tr")
    for row in rows:
        cells = row.select("td")
        if len(cells) < 3:
            continue
        ticker = cells[0].get_text(strip=True)
        name = cells[1].get_text(strip=True)
        price_text = cells[2].get_text(strip=True).replace("$", "").replace(",", "")
        try:
            price = float(price_text)
        except (ValueError, TypeError):
            price = None
        stocks.append({"ticker": ticker, "name": name, "price": price, "exchange": ""})

    return stocks if stocks else None


async def _fetch_finviz() -> list[dict] | None:
    """SOURCE 2: Finviz screener (NYSE + NASDAQ)."""
    url = "https://finviz.com/screener.ashx?v=111&f=exch_nasd,exch_nyse"
    html = await fetch_html(url)
    if not html:
        return None

    soup = parse_html(html)
    table = soup.select_one("table.table-light")
    if not table:
        # Try alternative selector
        tables = soup.select("table")
        table = tables[-1] if tables else None
    if not table:
        return None

    stocks = []
    rows = table.select("tr")[1:]  # skip header
    for row in rows:
        cells = row.select("td")
        if len(cells) < 4:
            continue
        ticker = cells[1].get_text(strip=True)
        name = cells[2].get_text(strip=True)
        price_text = cells[-2].get_text(strip=True).replace(",", "")
        try:
            price = float(price_text)
        except (ValueError, TypeError):
            price = None
        stocks.append({"ticker": ticker, "name": name, "price": price, "exchange": ""})

    return stocks if stocks else None


async def _fetch_sec_edgar() -> list[dict] | None:
    """SOURCE 3: SEC EDGAR company tickers (official, never fails)."""
    url = "https://www.sec.gov/files/company_tickers.json"
    headers = {
        "User-Agent": "SimuAlpha/1.0 (contact@example.com)",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, headers=headers)
            if r.status_code != 200:
                return None
            data = r.json()
    except Exception as e:
        print(f"SEC EDGAR failed: {e}")
        return None

    stocks = []
    for entry in data.values():
        ticker = (entry.get("ticker") or "").upper().strip()
        name = entry.get("title") or ""
        cik = entry.get("cik_str")
        stocks.append({
            "ticker": ticker,
            "name": name,
            "price": None,  # SEC doesn't provide prices
            "exchange": "",
            "cik": cik,
        })

    return stocks if stocks else None


def _deduplicate(all_stocks: list[dict]) -> list[dict]:
    """Deduplicate by ticker, keeping the first occurrence (highest priority source)."""
    seen = set()
    unique = []
    for s in all_stocks:
        t = s["ticker"]
        if t not in seen:
            seen.add(t)
            unique.append(s)
    return unique


async def fetch_universe() -> list[dict]:
    """
    Fetch the full stock universe with 3-source fallback.
    Returns a filtered, deduplicated list of stock dicts.
    Caches for 24 hours.
    """
    now = time.time()
    if _cache.get("stocks") and (now - _cache.get("fetched_at", 0)) < _CACHE_TTL:
        print(f"Universe loaded from cache ({len(_cache['stocks'])} stocks)")
        return _cache["stocks"]

    all_stocks: list[dict] = []
    source_used = []

    # Try each source in priority order, accumulate results
    sa_stocks = await _fetch_stockanalysis()
    if sa_stocks:
        all_stocks.extend(sa_stocks)
        source_used.append(f"StockAnalysis ({len(sa_stocks)})")

    finviz_stocks = await _fetch_finviz()
    if finviz_stocks:
        all_stocks.extend(finviz_stocks)
        source_used.append(f"Finviz ({len(finviz_stocks)})")

    sec_stocks = await _fetch_sec_edgar()
    if sec_stocks:
        all_stocks.extend(sec_stocks)
        source_used.append(f"SEC EDGAR ({len(sec_stocks)})")

    # Deduplicate and filter
    unique = _deduplicate(all_stocks)
    filtered = _apply_filters(unique)

    # Cache the result
    _cache["stocks"] = filtered
    _cache["fetched_at"] = now

    sources_str = " + ".join(source_used) if source_used else "none"
    print(f"Universe loaded from {sources_str} — {len(filtered)} stocks after filtering")

    return filtered
