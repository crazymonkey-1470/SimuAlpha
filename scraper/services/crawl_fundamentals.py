import httpx

from .scrape_utils import fetch_html, fetch_json, parse
from .yfinance_source import get_fundamentals_yfinance, get_quote_yfinance
from cache.store import fundamentals_cache

CACHE_TTL = 86400  # 24 hours


async def _fetch_yahoo_chart_price(ticker: str) -> dict | None:
    """Direct Yahoo Finance chart API — no yfinance library needed.
    Returns {current_price, week_52_high, market_cap, company_name} or None."""
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=1d&interval=1d"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, headers=headers)
            if r.status_code != 200:
                return None
            data = r.json()
            meta = data.get("chart", {}).get("result", [{}])[0].get("meta", {})
            price = meta.get("regularMarketPrice")
            if price is None:
                return None
            return {
                "current_price": float(price),
                "week_52_high": float(meta["fiftyTwoWeekHigh"]) if meta.get("fiftyTwoWeekHigh") else None,
                "market_cap": None,  # chart API doesn't return market cap
                "company_name": meta.get("longName") or meta.get("shortName"),
            }
    except Exception as e:
        print(f"  [Yahoo Chart] {ticker} error: {e}")
        return None


async def _fetch_yahoo_quote_price(ticker: str) -> dict | None:
    """Yahoo Finance v6 quote API — another direct fallback for price data."""
    try:
        url = f"https://query1.finance.yahoo.com/v6/finance/quote?symbols={ticker}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url, headers=headers)
            if r.status_code != 200:
                return None
            data = r.json()
            quotes = data.get("quoteResponse", {}).get("result", [])
            if not quotes:
                return None
            q = quotes[0]
            price = q.get("regularMarketPrice")
            if price is None:
                return None
            return {
                "current_price": float(price),
                "week_52_high": float(q["fiftyTwoWeekHigh"]) if q.get("fiftyTwoWeekHigh") else None,
                "market_cap": float(q["marketCap"]) if q.get("marketCap") else None,
                "company_name": q.get("longName") or q.get("shortName"),
                "sector": q.get("sector"),
                "pe_ratio": round(float(q["trailingPE"]), 2) if q.get("trailingPE") else None,
                "ps_ratio": round(float(q["priceToSalesTrailing12Months"]), 2) if q.get("priceToSalesTrailing12Months") else None,
            }
    except Exception as e:
        print(f"  [Yahoo Quote] {ticker} error: {e}")
        return None


async def get_fundamentals(ticker: str) -> dict:
    cached = fundamentals_cache.get(f"fund_{ticker}")
    if cached:
        return cached

    # Build result dict — we'll fill it from multiple sources
    result = {
        "ticker": ticker,
        "company_name": None,
        "market_cap": None,
        "current_price": None,
        "week_52_high": None,
        "revenue_current": None,
        "revenue_prior_year": None,
        "revenue_growth_pct": None,
        "pe_ratio": None,
        "ps_ratio": None,
        "debt_to_equity": None,
        "current_ratio": None,
        "free_cash_flow": None,
        "gross_margin": None,
        "sector": None,
        "source": None,
    }

    # === SOURCE 1: yfinance (fastest for full data) ===
    try:
        yf_fund = await get_fundamentals_yfinance(ticker)
        yf_quote = await get_quote_yfinance(ticker)

        if yf_quote:
            result["current_price"] = yf_quote.get("current_price")
            result["week_52_high"] = yf_quote.get("week_52_high")
            result["market_cap"] = yf_quote.get("market_cap")
            result["company_name"] = yf_quote.get("company_name")
            result["sector"] = yf_quote.get("sector")
            result["pe_ratio"] = yf_quote.get("pe_ratio")
            result["ps_ratio"] = yf_quote.get("ps_ratio")
            result["source"] = "yfinance"
        if yf_fund:
            result["revenue_current"] = yf_fund.get("revenue_current")
            result["revenue_prior_year"] = yf_fund.get("revenue_prior_year")
            result["revenue_growth_pct"] = yf_fund.get("revenue_growth_pct")
            if result["pe_ratio"] is None:
                result["pe_ratio"] = yf_fund.get("pe_ratio")
            if result["ps_ratio"] is None:
                result["ps_ratio"] = yf_fund.get("ps_ratio")
            result["source"] = result["source"] or "yfinance"

        # If we have both price and revenue, we're done
        if result["current_price"] is not None and result["revenue_current"] is not None:
            fundamentals_cache.set(f"fund_{ticker}", result, CACHE_TTL)
            return result
    except Exception as e:
        print(f"  [yfinance] {ticker} error: {e}")

    # === SOURCE 2: Direct Yahoo Finance API (if yfinance failed for price) ===
    if result["current_price"] is None:
        print(f"  [Fundamentals] {ticker}: yfinance had no price, trying Yahoo API direct...")
        yahoo_data = await _fetch_yahoo_chart_price(ticker)
        if yahoo_data is None:
            yahoo_data = await _fetch_yahoo_quote_price(ticker)
        if yahoo_data:
            result["current_price"] = yahoo_data.get("current_price") or result["current_price"]
            result["week_52_high"] = yahoo_data.get("week_52_high") or result["week_52_high"]
            result["market_cap"] = yahoo_data.get("market_cap") or result["market_cap"]
            result["company_name"] = yahoo_data.get("company_name") or result["company_name"]
            if yahoo_data.get("sector"):
                result["sector"] = result["sector"] or yahoo_data["sector"]
            if yahoo_data.get("pe_ratio"):
                result["pe_ratio"] = result["pe_ratio"] or yahoo_data["pe_ratio"]
            if yahoo_data.get("ps_ratio"):
                result["ps_ratio"] = result["ps_ratio"] or yahoo_data["ps_ratio"]
            result["source"] = result["source"] or "yahoo_api"

        # If we now have both, we're done
        if result["current_price"] is not None and result["revenue_current"] is not None:
            fundamentals_cache.set(f"fund_{ticker}", result, CACHE_TTL)
            return result

    # FALLBACK 1a: StockAnalysis overview page (market cap, price, 52w high)
    try:
        url = f"https://stockanalysis.com/stocks/{ticker.lower()}/"
        html = await fetch_html(url)
        if html:
            soup = parse(html)
            # Company name from h1
            h1 = soup.find("h1")
            if h1:
                result["company_name"] = h1.get_text(strip=True).split(" (")[0]

            # Parse the key stats table/info items on the overview page
            # StockAnalysis uses data tables with label-value pairs
            for table in soup.find_all("table"):
                for row in table.find_all("tr"):
                    cols = row.find_all("td")
                    if len(cols) >= 2:
                        label = cols[0].get_text(strip=True).lower()
                        value_text = cols[1].get_text(strip=True)
                        if "market cap" in label and result["market_cap"] is None:
                            result["market_cap"] = _parse_number(value_text)
                        elif label == "price" or "stock price" in label:
                            if result["current_price"] is None:
                                result["current_price"] = _parse_number(value_text)
                        elif "52" in label and "high" in label:
                            if result["week_52_high"] is None:
                                result["week_52_high"] = _parse_number(value_text)
                        elif "sector" in label and result["sector"] is None:
                            result["sector"] = value_text
                        elif "p/e" in label and result["pe_ratio"] is None:
                            result["pe_ratio"] = _parse_number(value_text)
                        elif "p/s" in label and result["ps_ratio"] is None:
                            result["ps_ratio"] = _parse_number(value_text)

            # Also check div-based stat blocks (common on StockAnalysis)
            for item in soup.find_all(["div", "span", "td"]):
                text = item.get_text(strip=True)
                if not text:
                    continue
                # Look for "Market Cap" followed by a value in a sibling/child
                parent = item.parent
                if parent and "market cap" in text.lower() and result["market_cap"] is None:
                    sibling = item.find_next_sibling()
                    if sibling:
                        val = _parse_number(sibling.get_text(strip=True))
                        if val and val > 1_000_000:
                            result["market_cap"] = val

    except Exception as e:
        print(f"  [Fundamentals] {ticker} overview error: {e}")

    # FALLBACK 1b: StockAnalysis income statement (revenue)
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
        print(f"  [Fundamentals] {ticker} income error: {e}")

    # FALLBACK 1c: StockAnalysis ratios (P/E, P/S if not already found)
    if result["pe_ratio"] is None or result["ps_ratio"] is None:
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
            print(f"  [Fundamentals] {ticker} ratios error: {e}")

    # FALLBACK 2: SEC EDGAR (revenue + market cap from shares outstanding)
    needs_edgar = result["revenue_current"] is None or result["market_cap"] is None
    if needs_edgar:
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
                    dei = facts.get("facts", {}).get("dei", {})

                    # Revenue from XBRL
                    if result["revenue_current"] is None:
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
                                    result["source"] = result["source"] or "SEC EDGAR"
                                    break

                    # Market cap from EntityPublicFloat or shares outstanding
                    if result["market_cap"] is None:
                        # Try EntityPublicFloat first (most direct)
                        if "EntityPublicFloat" in dei:
                            epf_units = dei["EntityPublicFloat"].get("units", {}).get("USD", [])
                            if epf_units:
                                latest = sorted(epf_units, key=lambda x: x.get("end", ""), reverse=True)
                                if latest:
                                    result["market_cap"] = latest[0]["val"]

                    # Try shares outstanding * current price
                    if result["market_cap"] is None and result["current_price"] is not None:
                        for shares_key in [
                            "EntityCommonStockSharesOutstanding",
                            "CommonStockSharesOutstanding",
                        ]:
                            if shares_key in dei:
                                shares_units = dei[shares_key].get("units", {}).get("shares", [])
                                if shares_units:
                                    latest = sorted(shares_units, key=lambda x: x.get("end", ""), reverse=True)
                                    if latest and latest[0]["val"] > 0:
                                        result["market_cap"] = latest[0]["val"] * result["current_price"]
                                        break

                    if result["company_name"] is None and "EntityRegistrantName" in dei:
                        name_units = dei["EntityRegistrantName"].get("units", {})
                        for unit_vals in name_units.values():
                            if unit_vals:
                                latest = sorted(unit_vals, key=lambda x: x.get("end", ""), reverse=True)
                                if latest:
                                    result["company_name"] = latest[0].get("val", ticker)
                                    break
        except Exception as e:
            print(f"  [Fundamentals] {ticker} EDGAR error: {e}")

    # Only cache if we got meaningful data (price or revenue).
    # Do NOT cache null-price results — they'd block retries for 24h.
    has_price = result["current_price"] is not None
    has_revenue = result["revenue_current"] is not None
    if has_price and has_revenue:
        fundamentals_cache.set(f"fund_{ticker}", result, CACHE_TTL)
    elif has_price or has_revenue:
        # Partial data — cache for shorter period (1 hour)
        fundamentals_cache.set(f"fund_{ticker}", result, 3600)
    # else: don't cache at all — let next request retry

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
