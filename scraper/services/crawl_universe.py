from .scrape_utils import fetch_html, fetch_json, parse
from cache.store import universe_cache

CACHE_TTL = 86400  # 24 hours


async def get_universe() -> list[dict]:
    cached = universe_cache.get("universe")
    if cached:
        print(f"[Universe] Cache hit: {len(cached)} stocks")
        return cached

    stocks = []

    # SOURCE 1: StockAnalysis.com
    try:
        html = await fetch_html("https://stockanalysis.com/stocks/")
        if html:
            soup = parse(html)
            table = soup.find("table")
            if table:
                rows = table.find_all("tr")[1:]
                for row in rows:
                    cols = row.find_all("td")
                    if len(cols) >= 2:
                        stocks.append(
                            {
                                "ticker": cols[0].get_text(strip=True),
                                "company_name": cols[1].get_text(strip=True),
                                "exchange": "US",
                                "sector": cols[3].get_text(strip=True)
                                if len(cols) > 3
                                else None,
                                "market_cap": None,
                                "current_price": None,
                            }
                        )
    except Exception as e:
        print(f"[Universe] StockAnalysis error: {e}")

    # SOURCE 2: SEC EDGAR (never fails)
    if len(stocks) < 100:
        try:
            data = await fetch_json(
                "https://www.sec.gov/files/company_tickers.json"
            )
            if data:
                stocks = [
                    {
                        "ticker": v["ticker"].upper(),
                        "company_name": v["title"],
                        "exchange": "US",
                        "sector": None,
                        "market_cap": None,
                        "current_price": None,
                        "cik": str(v["cik_str"]).zfill(10),
                    }
                    for v in data.values()
                ]
        except Exception as e:
            print(f"[Universe] SEC EDGAR error: {e}")

    # Filter
    filtered = []
    seen: set[str] = set()
    for s in stocks:
        t = s.get("ticker", "")
        if not t or t in seen:
            continue
        if len(t) > 5:
            continue
        if "." in t or "/" in t:
            continue
        if len(t) > 2 and t[-1] in ("W", "R", "U"):
            continue
        if any(c.isdigit() for c in t):
            continue
        seen.add(t)
        filtered.append(s)

    print(f"[Universe] Final: {len(filtered)} tickers after filter")
    universe_cache.set("universe", filtered, CACHE_TTL)
    return filtered
