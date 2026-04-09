"""
SEC EDGAR 13F Holdings Scraper

Fetches quarterly 13F-HR filings for tracked super investors.
Parses XML holdings tables and computes quarterly signals.

Rate limits: max 10 req/sec, User-Agent required by SEC.
"""

import os
import asyncio
import xml.etree.ElementTree as ET
from datetime import datetime

import httpx

SEC_EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index"
SEC_EDGAR_FILINGS = "https://www.sec.gov/cgi-bin/browse-edgar"
SEC_EDGAR_FULL_TEXT = "https://efts.sec.gov/LATEST/search-index"
SEC_BASE = "https://www.sec.gov"
EDGAR_API = "https://data.sec.gov"

USER_AGENT = os.environ.get(
    "SEC_USER_AGENT",
    "SimuAlpha/1.0 (andrew@thesmallbusiness.ai)"
)

# SEC rate limit: max 10 req/sec
_last_sec_call = 0.0
_sec_lock = asyncio.Lock()


async def _sec_rate_limit():
    global _last_sec_call
    async with _sec_lock:
        now = asyncio.get_event_loop().time()
        wait = 0.15 - (now - _last_sec_call)  # ~7 req/sec to stay under 10
        if wait > 0:
            await asyncio.sleep(wait)
        _last_sec_call = asyncio.get_event_loop().time()


async def _sec_get(url: str, params: dict = None) -> httpx.Response | None:
    """Rate-limited GET to SEC EDGAR."""
    await _sec_rate_limit()
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Encoding": "gzip, deflate",
        "Accept": "application/json, text/html, application/xml",
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(url, params=params, headers=headers)
            if r.status_code == 200:
                return r
            elif r.status_code == 429:
                print(f"  [SEC] Rate limited on {url}, waiting 2s...")
                await asyncio.sleep(2)
                return None
            else:
                print(f"  [SEC] {url} returned {r.status_code}")
                return None
    except Exception as e:
        print(f"  [SEC] {url} error: {e}")
        return None


# ── CUSIP → Ticker mapping cache ──
_cusip_cache: dict[str, str] = {}


def _cusip_to_ticker_from_name(company_name: str) -> str | None:
    """Best-effort ticker extraction from company name. Fallback only."""
    # Common mappings for top holdings
    known = {
        "APPLE INC": "AAPL", "MICROSOFT CORP": "MSFT", "AMAZON COM INC": "AMZN",
        "ALPHABET INC": "GOOGL", "META PLATFORMS INC": "META", "NVIDIA CORP": "NVDA",
        "TESLA INC": "TSLA", "BERKSHIRE HATHAWAY": "BRK.B", "JPMORGAN CHASE": "JPM",
        "VISA INC": "V", "MASTERCARD INC": "MA", "UNITEDHEALTH GROUP": "UNH",
        "JOHNSON & JOHNSON": "JNJ", "EXXON MOBIL CORP": "XOM", "CHEVRON CORP": "CVX",
        "PROCTER & GAMBLE": "PG", "ELI LILLY & CO": "LLY", "ABBVIE INC": "ABBV",
        "COCA COLA CO": "KO", "PEPSICO INC": "PEP", "WALMART INC": "WMT",
        "COSTCO WHOLESALE": "COST", "HOME DEPOT INC": "HD", "DISNEY WALT CO": "DIS",
        "NETFLIX INC": "NFLX", "SALESFORCE INC": "CRM", "ADOBE INC": "ADBE",
        "PAYPAL HLDGS INC": "PYPL", "BLOCK INC": "SQ", "SNOWFLAKE INC": "SNOW",
        "COINBASE GLOBAL": "COIN", "PALANTIR TECHNOLOGIES": "PLTR",
    }
    if not company_name:
        return None
    name_upper = company_name.upper().strip()
    for k, v in known.items():
        if k in name_upper:
            return v
    return None


async def fetch_latest_13f(cik: str) -> dict:
    """
    Fetch the latest 13F-HR filing for a given CIK.

    Returns:
        {
            "cik": str,
            "filing_date": str,
            "quarter": str,  # e.g. "2025Q4"
            "holdings": [
                {
                    "cusip": str,
                    "company_name": str,
                    "shares": int,
                    "market_value": int,
                    "type": str,  # "SH" (shares), "CALL", "PUT"
                }
            ]
        }
    """
    # Step 1: Find latest 13F-HR filing index
    submissions_url = f"{EDGAR_API}/submissions/CIK{cik.lstrip('0').zfill(10)}.json"
    resp = await _sec_get(submissions_url)
    if not resp:
        return {"cik": cik, "error": "Failed to fetch submissions", "holdings": []}

    try:
        data = resp.json()
    except Exception:
        return {"cik": cik, "error": "Invalid JSON from SEC", "holdings": []}

    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    filing_dates = recent.get("filingDate", [])
    primary_docs = recent.get("primaryDocument", [])

    # Find the most recent 13F-HR
    filing_idx = None
    for i, form in enumerate(forms):
        if form in ("13F-HR", "13F-HR/A"):
            filing_idx = i
            break

    if filing_idx is None:
        return {"cik": cik, "error": "No 13F-HR filing found", "holdings": []}

    accession = accessions[filing_idx].replace("-", "")
    filing_date = filing_dates[filing_idx]

    # Determine quarter from filing date
    # 13F filings are due 45 days after quarter end
    # Filing in Feb = Q4 prior year, May = Q1, Aug = Q2, Nov = Q3
    fd = datetime.strptime(filing_date, "%Y-%m-%d")
    if fd.month <= 2:
        quarter = f"{fd.year - 1}Q4"
    elif fd.month <= 5:
        quarter = f"{fd.year}Q1"
    elif fd.month <= 8:
        quarter = f"{fd.year}Q2"
    elif fd.month <= 11:
        quarter = f"{fd.year}Q3"
    else:
        quarter = f"{fd.year}Q4"

    # Step 2: Find the information table XML document
    cik_padded = cik.lstrip("0").zfill(10)
    index_url = f"{EDGAR_API}/Archives/edgar/data/{cik_padded}/{accession}/index.json"
    idx_resp = await _sec_get(index_url)
    if not idx_resp:
        return {"cik": cik, "filing_date": filing_date, "quarter": quarter,
                "error": "Failed to fetch filing index", "holdings": []}

    try:
        idx_data = idx_resp.json()
    except Exception:
        return {"cik": cik, "filing_date": filing_date, "quarter": quarter,
                "error": "Invalid filing index JSON", "holdings": []}

    # Look for the information table XML
    info_table_url = None
    for item in idx_data.get("directory", {}).get("item", []):
        name = item.get("name", "").lower()
        if "infotable" in name and name.endswith(".xml"):
            info_table_url = f"{EDGAR_API}/Archives/edgar/data/{cik_padded}/{accession}/{item['name']}"
            break

    if not info_table_url:
        # Try primary document as fallback
        primary = primary_docs[filing_idx] if filing_idx < len(primary_docs) else None
        if primary and primary.endswith(".xml"):
            info_table_url = f"{EDGAR_API}/Archives/edgar/data/{cik_padded}/{accession}/{primary}"

    if not info_table_url:
        return {"cik": cik, "filing_date": filing_date, "quarter": quarter,
                "error": "Info table XML not found in filing", "holdings": []}

    # Step 3: Parse the XML holdings table
    xml_resp = await _sec_get(info_table_url)
    if not xml_resp:
        return {"cik": cik, "filing_date": filing_date, "quarter": quarter,
                "error": "Failed to fetch holdings XML", "holdings": []}

    holdings = _parse_13f_xml(xml_resp.text)

    return {
        "cik": cik,
        "filing_date": filing_date,
        "quarter": quarter,
        "holdings_count": len(holdings),
        "holdings": holdings,
    }


def _parse_13f_xml(xml_text: str) -> list[dict]:
    """Parse 13F XML information table into holdings list."""
    holdings = []

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        print("  [SEC] Failed to parse 13F XML")
        return []

    # Handle namespace variations
    # Common namespaces: {http://www.sec.gov/13Fvaluename} or no namespace
    ns = ""
    for elem in root.iter():
        if "infoTable" in elem.tag:
            ns_end = elem.tag.find("}")
            if ns_end > 0:
                ns = elem.tag[:ns_end + 1]
            break

    for entry in root.iter(f"{ns}infoTable"):
        cusip = _get_text(entry, f"{ns}cusip")
        name = _get_text(entry, f"{ns}nameOfIssuer")
        shares_str = _get_text(entry, f"{ns}sshPrnamt") or _get_text(entry, f"{ns}value")
        value_str = _get_text(entry, f"{ns}value")
        inv_type = _get_text(entry, f"{ns}sshPrnamtType") or "SH"

        # Try to get shares from shrsOrPrnAmt sub-element
        shares_elem = entry.find(f"{ns}shrsOrPrnAmt")
        if shares_elem is not None:
            sh = shares_elem.find(f"{ns}sshPrnamt")
            if sh is not None and sh.text:
                shares_str = sh.text
            tp = shares_elem.find(f"{ns}sshPrnamtType")
            if tp is not None and tp.text:
                inv_type = tp.text.strip()

        # Investment discretion and voting
        put_call = _get_text(entry, f"{ns}putCall")

        try:
            shares = int(float(shares_str)) if shares_str else 0
        except (ValueError, TypeError):
            shares = 0

        try:
            market_value = int(float(value_str) * 1000) if value_str else 0  # 13F values in thousands
        except (ValueError, TypeError):
            market_value = 0

        # Determine type
        holding_type = "SH"
        if put_call:
            holding_type = put_call.upper()  # "CALL" or "PUT"
        elif inv_type and inv_type.upper() != "SH":
            holding_type = inv_type.upper()

        # Try to resolve ticker from CUSIP or name
        ticker = _cusip_cache.get(cusip) or _cusip_to_ticker_from_name(name)
        if ticker and cusip:
            _cusip_cache[cusip] = ticker

        holdings.append({
            "cusip": cusip,
            "company_name": name,
            "ticker": ticker,
            "shares": shares,
            "market_value": market_value,
            "type": holding_type,
        })

    return holdings


def _get_text(elem, tag):
    """Get text content of a sub-element, or None."""
    child = elem.find(tag)
    if child is not None and child.text:
        return child.text.strip()
    return None


def compute_quarterly_signals(
    current_holdings: list[dict],
    prior_holdings: list[dict],
) -> list[dict]:
    """
    Compare current vs prior quarter holdings to generate signals.

    Returns list of signal dicts:
    {
        "ticker": str,
        "cusip": str,
        "company_name": str,
        "signal_type": "NEW_BUY" | "ADD" | "REDUCE" | "EXIT" | "UNCHANGED",
        "shares_changed": int,
        "pct_change": float,
        "conviction_level": "EXTREME" | "HIGH" | "MODERATE" | "LOW",
        "has_call_options": bool,
        "has_put_options": bool,
    }
    """
    # Index prior holdings by CUSIP (or ticker as fallback)
    prior_map = {}
    for h in prior_holdings:
        key = h.get("cusip") or h.get("ticker") or h.get("company_name", "")
        if key and h.get("type", "SH") == "SH":
            prior_map[key] = h

    # Index current by CUSIP
    current_map = {}
    current_options = {}  # track options separately
    for h in current_holdings:
        key = h.get("cusip") or h.get("ticker") or h.get("company_name", "")
        if not key:
            continue
        if h.get("type", "SH") == "SH":
            current_map[key] = h
        elif h.get("type") in ("CALL", "PUT"):
            if key not in current_options:
                current_options[key] = {"call": False, "put": False}
            if h["type"] == "CALL":
                current_options[key]["call"] = True
            elif h["type"] == "PUT":
                current_options[key]["put"] = True

    signals = []

    # Process current holdings
    for key, curr in current_map.items():
        prior = prior_map.get(key)
        opts = current_options.get(key, {"call": False, "put": False})

        ticker = curr.get("ticker")
        cusip = curr.get("cusip")
        name = curr.get("company_name")
        curr_shares = curr.get("shares", 0)
        curr_value = curr.get("market_value", 0)

        if prior is None:
            # NEW BUY
            signals.append({
                "ticker": ticker,
                "cusip": cusip,
                "company_name": name,
                "signal_type": "NEW_BUY",
                "shares_changed": curr_shares,
                "pct_change": 100.0,
                "market_value": curr_value,
                "conviction_level": _assess_conviction(curr_value, None, "NEW_BUY", opts["call"]),
                "has_call_options": opts["call"],
                "has_put_options": opts["put"],
            })
        else:
            prior_shares = prior.get("shares", 0)
            if prior_shares == 0:
                continue

            pct_change = round((curr_shares - prior_shares) / prior_shares * 100, 2)
            shares_changed = curr_shares - prior_shares

            if abs(pct_change) < 1:
                signal_type = "UNCHANGED"
            elif pct_change > 0:
                signal_type = "ADD"
            else:
                signal_type = "REDUCE"

            signals.append({
                "ticker": ticker,
                "cusip": cusip,
                "company_name": name,
                "signal_type": signal_type,
                "shares_changed": shares_changed,
                "pct_change": pct_change,
                "market_value": curr_value,
                "conviction_level": _assess_conviction(curr_value, pct_change, signal_type, opts["call"]),
                "has_call_options": opts["call"],
                "has_put_options": opts["put"],
            })

    # Check for EXITS (in prior but not in current)
    for key, prior in prior_map.items():
        if key not in current_map:
            signals.append({
                "ticker": prior.get("ticker"),
                "cusip": prior.get("cusip"),
                "company_name": prior.get("company_name"),
                "signal_type": "EXIT",
                "shares_changed": -prior.get("shares", 0),
                "pct_change": -100.0,
                "market_value": 0,
                "conviction_level": "HIGH",
                "has_call_options": False,
                "has_put_options": False,
            })

    return signals


def _assess_conviction(market_value: int | None, pct_change: float | None,
                       signal_type: str, has_calls: bool) -> str:
    """Assess conviction level based on position size and action."""
    if has_calls and signal_type in ("NEW_BUY", "ADD"):
        return "EXTREME"

    mv = market_value or 0
    if signal_type == "NEW_BUY":
        if mv > 1_000_000_000:
            return "EXTREME"
        if mv > 500_000_000:
            return "HIGH"
        if mv > 100_000_000:
            return "MODERATE"
        return "LOW"

    if signal_type == "ADD":
        if pct_change and pct_change > 50:
            return "HIGH"
        if pct_change and pct_change > 20:
            return "MODERATE"
        return "LOW"

    if signal_type == "REDUCE":
        if pct_change and abs(pct_change) > 50:
            return "HIGH"
        return "MODERATE"

    return "LOW"


def compute_consensus(all_signals: dict[str, list[dict]]) -> list[dict]:
    """
    Compute cross-investor consensus for each ticker.

    Args:
        all_signals: { investor_name: [signal_dicts] }

    Returns:
        List of consensus dicts per ticker:
        {
            "ticker": str,
            "holders_count": int,
            "new_buyers_count": int,
            "sellers_count": int,
            "net_sentiment": str,
            "consensus_score": int,  # -10 to +10
        }
    """
    ticker_scores: dict[str, dict] = {}

    for investor_name, signals in all_signals.items():
        for sig in signals:
            ticker = sig.get("ticker")
            if not ticker:
                continue

            if ticker not in ticker_scores:
                ticker_scores[ticker] = {
                    "ticker": ticker,
                    "score": 0,
                    "holders": 0,
                    "new_buyers": 0,
                    "sellers": 0,
                    "investors": [],
                }

            entry = ticker_scores[ticker]
            st = sig["signal_type"]

            if st == "NEW_BUY":
                entry["score"] += 3
                entry["holders"] += 1
                entry["new_buyers"] += 1
            elif st == "ADD":
                entry["score"] += 2
                entry["holders"] += 1
            elif st == "UNCHANGED":
                entry["score"] += 1
                entry["holders"] += 1
            elif st == "REDUCE":
                entry["score"] -= 1
                entry["sellers"] += 1
                entry["holders"] += 1
            elif st == "EXIT":
                entry["score"] -= 3
                entry["sellers"] += 1

            # Extreme conviction bonus
            if sig.get("has_call_options") and st in ("NEW_BUY", "ADD"):
                entry["score"] += 5

            entry["investors"].append(investor_name)

    results = []
    for ticker, data in ticker_scores.items():
        score = max(-10, min(10, data["score"]))

        if score >= 6:
            sentiment = "STRONG_BUY"
        elif score >= 3:
            sentiment = "BUY"
        elif score >= -2:
            sentiment = "MIXED"
        elif score >= -5:
            sentiment = "SELL"
        else:
            sentiment = "STRONG_SELL"

        results.append({
            "ticker": ticker,
            "holders_count": data["holders"],
            "new_buyers_count": data["new_buyers"],
            "sellers_count": data["sellers"],
            "net_sentiment": sentiment,
            "consensus_score": score,
        })

    results.sort(key=lambda x: x["consensus_score"], reverse=True)
    return results
