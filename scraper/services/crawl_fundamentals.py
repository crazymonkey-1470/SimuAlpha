from .scrape_utils import fetch_html, fetch_json, parse
from cache.store import fundamentals_cache

CACHE_TTL = 21600  # 6 hours


async def get_fundamentals(ticker: str) -> dict:
    cached = fundamentals_cache.get(f"fund_{ticker}")
    if cached:
        return cached

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
        "gross_margin": None,
        "source": None,
    }

    # SOURCE 1: StockAnalysis income statement
    print(f"  [Fundamentals] {ticker} -> StockAnalysis...")
    try:
        url = f"https://stockanalysis.com/stocks/{ticker.lower()}/financials/"
        html = await fetch_html(url)
        if html:
            soup = parse(html)
            tables = soup.find_all("table")
            for table in tables:
                for row in table.find_all("tr"):
                    cols = row.find_all("td")
                    if cols and "revenue" in cols[0].get_text(strip=True).lower():
                        values = [
                            _parse_number(c.get_text(strip=True)) for c in cols[1:]
                        ]
                        values = [v for v in values if v is not None]
                        if len(values) >= 2:
                            result["revenue_current"] = values[0]
                            result["revenue_prior_year"] = values[1]
                            if values[1] > 0:
                                result["revenue_growth_pct"] = round(
                                    (values[0] - values[1]) / values[1] * 100, 2
                                )
                            result["source"] = "StockAnalysis"
                            break
    except Exception as e:
        print(f"  [Fundamentals] {ticker} StockAnalysis income failed: {e}")

    # StockAnalysis ratios
    try:
        url = f"https://stockanalysis.com/stocks/{ticker.lower()}/financials/ratios/"
        html = await fetch_html(url)
        if html:
            soup = parse(html)
            for table in soup.find_all("table"):
                for row in table.find_all("tr"):
                    cols = row.find_all("td")
                    if not cols:
                        continue
                    label = cols[0].get_text(strip=True).lower()
                    if "p/e" in label and result["pe_ratio"] is None:
                        result["pe_ratio"] = _parse_number(
                            cols[1].get_text(strip=True)
                        )
                    if "p/s" in label and result["ps_ratio"] is None:
                        result["ps_ratio"] = _parse_number(
                            cols[1].get_text(strip=True)
                        )
    except Exception as e:
        print(f"  [Fundamentals] {ticker} StockAnalysis ratios failed: {e}")

    # SOURCE 2: SEC EDGAR fallback
    if result["revenue_current"] is None:
        print(f"  [Fundamentals] {ticker} -> SEC EDGAR...")
        try:
            tickers_data = await fetch_json(
                "https://www.sec.gov/files/company_tickers.json"
            )
            cik = None
            if tickers_data:
                for v in tickers_data.values():
                    if v["ticker"].upper() == ticker.upper():
                        cik = str(v["cik_str"]).zfill(10)
                        break

            if cik:
                facts = await fetch_json(
                    f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
                )
                if facts:
                    us_gaap = facts.get("facts", {}).get("us-gaap", {})
                    for key in [
                        "Revenues",
                        "RevenueFromContractWithCustomerExcludingAssessedTax",
                        "SalesRevenueNet",
                    ]:
                        if key in us_gaap:
                            units = us_gaap[key].get("units", {}).get("USD", [])
                            annual = sorted(
                                [
                                    u
                                    for u in units
                                    if u.get("form") == "10-K"
                                    and u.get("fp") == "FY"
                                ],
                                key=lambda x: x.get("end", ""),
                                reverse=True,
                            )
                            if len(annual) >= 2:
                                result["revenue_current"] = annual[0]["val"]
                                result["revenue_prior_year"] = annual[1]["val"]
                                if annual[1]["val"] > 0:
                                    result["revenue_growth_pct"] = round(
                                        (annual[0]["val"] - annual[1]["val"])
                                        / annual[1]["val"]
                                        * 100,
                                        2,
                                    )
                                result["source"] = "SEC EDGAR"
                                break
        except Exception as e:
            print(f"  [Fundamentals] {ticker} SEC EDGAR failed: {e}")

    if result["revenue_current"] is not None:
        fundamentals_cache.set(f"fund_{ticker}", result, CACHE_TTL)

    return result


def _parse_number(text: str) -> float | None:
    """Parse numbers like $46.8B, 18.2, -5.3%, 1,234.5"""
    try:
        text = text.strip().replace(",", "").replace("$", "").replace("%", "")
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
        return float(text) * multiplier
    except (ValueError, TypeError):
        return None
