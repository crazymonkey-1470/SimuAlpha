import time

import httpx

from .scrape_utils import fetch_html, parse_html

# Per-ticker cache: { "AAPL": {"data": {...}, "fetched_at": ts} }
_cache: dict = {}
_CACHE_TTL = 6 * 60 * 60  # 6 hours

# CIK lookup cache (populated from SEC EDGAR tickers.json)
_cik_map: dict[str, int] = {}

SEC_HEADERS = {
    "User-Agent": "SimuAlpha/1.0 (contact@example.com)",
    "Accept": "application/json",
}


async def _ensure_cik_map():
    """Load ticker→CIK mapping from SEC EDGAR if not already cached."""
    if _cik_map:
        return
    url = "https://www.sec.gov/files/company_tickers.json"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, headers=SEC_HEADERS)
            if r.status_code == 200:
                data = r.json()
                for entry in data.values():
                    ticker = (entry.get("ticker") or "").upper().strip()
                    cik = entry.get("cik_str")
                    if ticker and cik:
                        _cik_map[ticker] = int(cik)
    except Exception as e:
        print(f"Failed to load CIK map: {e}")


def _parse_number(text: str) -> float | None:
    """Parse a number from text like '$1.2B', '45,123', '1.2M', etc."""
    if not text:
        return None
    text = text.strip().replace("$", "").replace(",", "").replace("%", "")
    multiplier = 1
    if text.endswith("T"):
        multiplier = 1_000_000_000_000
        text = text[:-1]
    elif text.endswith("B"):
        multiplier = 1_000_000_000
        text = text[:-1]
    elif text.endswith("M"):
        multiplier = 1_000_000
        text = text[:-1]
    elif text.endswith("K"):
        multiplier = 1_000
        text = text[:-1]
    try:
        return float(text) * multiplier
    except (ValueError, TypeError):
        return None


def _extract_table_data(html: str, target_labels: list[str]) -> dict[str, str]:
    """
    Extract key-value pairs from an HTML table where column 0 is the label
    and subsequent columns are values (most recent first).
    """
    soup = parse_html(html)
    result: dict[str, str] = {}
    table = soup.select_one("table")
    if not table:
        return result

    for tr in table.select("tbody tr"):
        cells = tr.select("td, th")
        if len(cells) < 2:
            continue
        label = cells[0].get_text(strip=True).lower()
        for target in target_labels:
            if target.lower() in label:
                # Take the most recent value (first data column)
                value = cells[1].get_text(strip=True)
                result[target] = value
                break

    return result


async def _fetch_stockanalysis_financials(ticker: str) -> dict | None:
    """SOURCE 1: StockAnalysis.com financials page."""
    url = f"https://stockanalysis.com/stocks/{ticker.lower()}/financials/"
    html = await fetch_html(url)
    if not html:
        return None

    targets = ["revenue", "gross profit", "operating income", "net income", "free cash flow"]
    data = _extract_table_data(html, targets)
    if not data:
        return None

    # Try to get current and prior year revenue for growth calc
    soup = parse_html(html)
    table = soup.select_one("table")
    revenue_current = None
    revenue_prior = None
    if table:
        for tr in table.select("tbody tr"):
            cells = tr.select("td, th")
            if len(cells) >= 3 and "revenue" in cells[0].get_text(strip=True).lower():
                revenue_current = _parse_number(cells[1].get_text(strip=True))
                revenue_prior = _parse_number(cells[2].get_text(strip=True))
                break

    return {
        "revenue_current": revenue_current,
        "revenue_prior_year": revenue_prior,
        "free_cash_flow": _parse_number(data.get("free cash flow", "")),
        "source": "StockAnalysis",
    }


async def _fetch_stockanalysis_ratios(ticker: str) -> dict | None:
    """SOURCE 2: StockAnalysis.com ratios page."""
    url = f"https://stockanalysis.com/stocks/{ticker.lower()}/financials/ratios/"
    html = await fetch_html(url)
    if not html:
        return None

    targets = ["pe ratio", "ps ratio", "p/e", "p/s", "p/b", "debt / equity", "current ratio"]
    data = _extract_table_data(html, targets)
    if not data:
        return None

    pe = _parse_number(data.get("pe ratio") or data.get("p/e", ""))
    ps = _parse_number(data.get("ps ratio") or data.get("p/s", ""))
    de = _parse_number(data.get("debt / equity", ""))
    cr = _parse_number(data.get("current ratio", ""))

    return {
        "pe_ratio": pe,
        "ps_ratio": ps,
        "debt_to_equity": de,
        "current_ratio": cr,
        "source": "StockAnalysis",
    }


async def _fetch_sec_edgar_xbrl(ticker: str) -> dict | None:
    """SOURCE 3: SEC EDGAR XBRL API (official fallback)."""
    await _ensure_cik_map()
    cik = _cik_map.get(ticker.upper())
    if not cik:
        print(f"SEC EDGAR: no CIK found for {ticker}")
        return None

    # Pad CIK to 10 digits
    cik_padded = str(cik).zfill(10)
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik_padded}.json"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url, headers=SEC_HEADERS)
            if r.status_code != 200:
                return None
            data = r.json()
    except Exception as e:
        print(f"SEC EDGAR XBRL failed for {ticker}: {e}")
        return None

    facts = data.get("facts", {}).get("us-gaap", {})

    def _latest_annual(concept: str) -> float | None:
        """Get the most recent 10-K value for a concept."""
        entries = facts.get(concept, {}).get("units", {})
        # Try USD first, then pure number
        for unit_key in ("USD", "pure"):
            items = entries.get(unit_key, [])
            annual = [i for i in items if i.get("form") == "10-K"]
            if annual:
                annual.sort(key=lambda x: x.get("end", ""), reverse=True)
                return annual[0].get("val")
        return None

    def _two_latest_annual(concept: str) -> tuple[float | None, float | None]:
        """Get the two most recent 10-K values."""
        entries = facts.get(concept, {}).get("units", {})
        for unit_key in ("USD", "pure"):
            items = entries.get(unit_key, [])
            annual = [i for i in items if i.get("form") == "10-K"]
            if len(annual) >= 2:
                annual.sort(key=lambda x: x.get("end", ""), reverse=True)
                return annual[0].get("val"), annual[1].get("val")
            elif len(annual) == 1:
                return annual[0].get("val"), None
        return None, None

    rev_current, rev_prior = _two_latest_annual("Revenues")
    if rev_current is None:
        rev_current, rev_prior = _two_latest_annual("RevenueFromContractWithCustomerExcludingAssessedTax")

    return {
        "revenue_current": rev_current,
        "revenue_prior_year": rev_prior,
        "free_cash_flow": _latest_annual("NetCashProvidedByOperatingActivities"),
        "pe_ratio": None,  # SEC doesn't provide ratios directly
        "ps_ratio": None,
        "debt_to_equity": None,
        "current_ratio": None,
        "source": "SEC EDGAR",
    }


async def fetch_fundamentals(ticker: str) -> dict:
    """
    Fetch fundamental data with 3-source fallback.
    Returns a unified dict with revenue, growth, ratios, etc.
    Caches per ticker for 6 hours.
    """
    ticker = ticker.upper().strip()
    now = time.time()

    cached = _cache.get(ticker)
    if cached and (now - cached.get("fetched_at", 0)) < _CACHE_TTL:
        print(f"Fundamentals {ticker}: loaded from cache")
        return cached["data"]

    result = {
        "ticker": ticker,
        "revenue_current": None,
        "revenue_prior_year": None,
        "revenue_growth_pct": None,
        "pe_ratio": None,
        "ps_ratio": None,
        "debt_to_equity": None,
        "current_ratio": None,
        "free_cash_flow": None,
        "source": "none",
    }

    # SOURCE 1: StockAnalysis financials
    sa_fin = await _fetch_stockanalysis_financials(ticker)
    if sa_fin:
        result.update({k: v for k, v in sa_fin.items() if v is not None})

    # SOURCE 2: StockAnalysis ratios
    sa_ratios = await _fetch_stockanalysis_ratios(ticker)
    if sa_ratios:
        for k, v in sa_ratios.items():
            if v is not None and result.get(k) is None:
                result[k] = v

    # SOURCE 3: SEC EDGAR (fill in any remaining gaps)
    if result["revenue_current"] is None:
        sec_data = await _fetch_sec_edgar_xbrl(ticker)
        if sec_data:
            for k, v in sec_data.items():
                if v is not None and result.get(k) is None:
                    result[k] = v

    # Calculate revenue growth if we have both years
    rev_c = result["revenue_current"]
    rev_p = result["revenue_prior_year"]
    if rev_c is not None and rev_p is not None and rev_p != 0:
        result["revenue_growth_pct"] = round(((rev_c - rev_p) / abs(rev_p)) * 100, 2)

    _cache[ticker] = {"data": result, "fetched_at": now}

    print(f"Fundamentals {ticker}: loaded from {result['source']}")

    return result
