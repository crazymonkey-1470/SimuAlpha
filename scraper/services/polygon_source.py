"""
Polygon.io data source — primary source for all financial data.
Clean REST API, reliable, no scraping needed.
"""

import os
import asyncio
from datetime import datetime, timedelta

import httpx

API_KEY = os.environ.get("POLYGON_API_KEY", "")
BASE = "https://api.polygon.io"

# Rate limiting: Polygon free tier = 5 req/min = 12s between requests.
# Paid tiers can lower this via POLYGON_RATE_DELAY env var (e.g. "1.5").
_last_call = 0.0
_lock = asyncio.Lock()

RATE_LIMIT_DELAY = float(os.environ.get("POLYGON_RATE_DELAY", "12"))

# Track 429s to auto-throttle if delay is set too low
_consecutive_429s = 0


async def _rate_limit():
    global _last_call
    async with _lock:
        now = asyncio.get_event_loop().time()
        wait = RATE_LIMIT_DELAY - (now - _last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_call = asyncio.get_event_loop().time()


async def _get(path: str, params: dict = None) -> dict | None:
    """Make a rate-limited GET request to Polygon API with exponential backoff."""
    global RATE_LIMIT_DELAY, _consecutive_429s

    if not API_KEY:
        print("  [Polygon] POLYGON_API_KEY not set!")
        return None

    await _rate_limit()

    url = f"{BASE}{path}"
    if params is None:
        params = {}
    params["apiKey"] = API_KEY

    max_retries = 3
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(url, params=params)
                if r.status_code == 200:
                    _consecutive_429s = 0
                    return r.json()
                elif r.status_code == 429:
                    _consecutive_429s += 1
                    backoff = min(15 * (2 ** attempt), 65)  # 15s, 30s, 60s
                    print(f"  [Polygon] Rate limited on {path}, backoff {backoff}s (attempt {attempt + 1}/{max_retries})")

                    # Auto-throttle: if we keep hitting 429s, increase base delay
                    if _consecutive_429s >= 3 and RATE_LIMIT_DELAY < 12:
                        RATE_LIMIT_DELAY = 12.0
                        print(f"  [Polygon] Auto-throttled: delay increased to {RATE_LIMIT_DELAY}s")

                    await asyncio.sleep(backoff)
                    continue
                else:
                    print(f"  [Polygon] {path} returned {r.status_code}")
                    return None
        except Exception as e:
            print(f"  [Polygon] {path} error: {e}")
            return None

    print(f"  [Polygon] {path} failed after {max_retries} retries")
    return None


async def get_ticker_details(ticker: str) -> dict | None:
    """Get company details: name, market_cap, sector, etc.
    Endpoint: GET /v3/reference/tickers/{ticker}
    """
    data = await _get(f"/v3/reference/tickers/{ticker}")
    if not data or data.get("status") != "OK":
        return None

    results = data.get("results", {})
    return {
        "company_name": results.get("name"),
        "market_cap": results.get("market_cap"),
        "sector": results.get("sic_description"),  # closest to sector
        "primary_exchange": results.get("primary_exchange"),
        "type": results.get("type"),
        "currency": results.get("currency_name"),
    }


async def get_previous_close(ticker: str) -> dict | None:
    """Get most recent closing price.
    Endpoint: GET /v2/aggs/ticker/{ticker}/prev
    """
    data = await _get(f"/v2/aggs/ticker/{ticker}/prev")
    if not data or data.get("resultsCount", 0) == 0:
        return None

    result = data["results"][0]
    return {
        "current_price": result.get("c"),  # close
        "open": result.get("o"),
        "high": result.get("h"),
        "low": result.get("l"),
        "volume": result.get("v"),
    }


async def get_financials(ticker: str) -> dict | None:
    """Get financial statements (revenue, FCF, debt, EPS, etc).
    Endpoint: GET /vX/reference/financials
    """
    data = await _get(
        "/vX/reference/financials",
        {
            "ticker": ticker,
            "timeframe": "annual",
            "order": "desc",
            "limit": 5,
            "sort": "filing_date",
        },
    )
    if not data or not data.get("results"):
        return None

    results = data["results"]

    revenue_current = None
    revenue_prior = None
    revenue_growth_pct = None
    eps = None
    eps_diluted = None
    revenue_history = []
    gross_margin_history = []

    # Extended financial fields
    free_cash_flow = None
    free_cash_flow_prior = None
    capex = None
    cash_and_equivalents = None
    total_debt = None
    total_equity = None
    debt_to_equity = None
    shares_outstanding = None
    shares_outstanding_prior = None
    shares_outstanding_change = None
    dividend_per_share = None
    net_income = None

    # Extract revenue and gross margin from each year (up to 5)
    for entry in results:
        income = entry.get("financials", {}).get("income_statement", {})
        rev_val = income.get("revenues", {}).get("value")
        cost_val = income.get("cost_of_revenue", {}).get("value")

        if isinstance(rev_val, (int, float)):
            revenue_history.append(rev_val)
            if isinstance(cost_val, (int, float)) and rev_val > 0:
                gm = round((rev_val - cost_val) / rev_val * 100, 2)
                gross_margin_history.append(gm)
            else:
                gross_margin_history.append(None)
        else:
            revenue_history.append(None)
            gross_margin_history.append(None)

    # Reverse to oldest-first order
    revenue_history = list(reversed(revenue_history))
    gross_margin_history = list(reversed(gross_margin_history))

    # Extract current and prior revenue + extended data from most recent filing
    if len(results) >= 1:
        entry = results[0]
        income = entry.get("financials", {}).get("income_statement", {})
        balance = entry.get("financials", {}).get("balance_sheet", {})
        cashflow = entry.get("financials", {}).get("cash_flow_statement", {})

        revenues = income.get("revenues", {})
        revenue_current = revenues.get("value")

        # EPS: prefer diluted over basic (Graham Ch.12)
        eps_diluted_data = income.get("diluted_earnings_per_share", {})
        eps_basic_data = income.get("basic_earnings_per_share", {})
        eps_diluted = eps_diluted_data.get("value")
        eps = eps_basic_data.get("value")
        if eps_diluted is None:
            eps_diluted = eps

        # Net income
        ni = income.get("net_income_loss", {}).get("value")
        if isinstance(ni, (int, float)):
            net_income = ni

        # Cash flow: operating cash flow - capex = FCF
        op_cf = cashflow.get("net_cash_flow_from_operating_activities", {}).get("value")
        cap_ex = cashflow.get("net_cash_flow_from_investing_activities", {}).get("value")
        # Polygon doesn't always separate capex; approximate from investing activities
        # Try dedicated capex field first, else use investing activities as proxy
        if isinstance(op_cf, (int, float)):
            # Try to find capex more precisely
            capex_raw = None
            # Some filings have capital expenditures directly
            for key in ["capital_expenditure", "purchase_of_property_plant_and_equipment"]:
                val = cashflow.get(key, {}).get("value")
                if isinstance(val, (int, float)):
                    capex_raw = abs(val)
                    break
            if capex_raw is not None:
                capex = capex_raw
                free_cash_flow = op_cf - capex_raw
            elif isinstance(cap_ex, (int, float)):
                # Investing activities is typically negative; FCF = operating + investing (rough)
                capex = abs(cap_ex)
                free_cash_flow = op_cf + cap_ex  # cap_ex is negative
            else:
                free_cash_flow = op_cf  # fallback: just operating CF

        # Dividends per share
        div_data = cashflow.get("payment_of_dividends", {}).get("value")
        shares_data = income.get("weighted_average_shares", {}).get("value")
        if isinstance(shares_data, (int, float)) and shares_data > 0:
            shares_outstanding = int(shares_data)
            if isinstance(div_data, (int, float)) and div_data != 0:
                dividend_per_share = abs(div_data) / shares_data

        # Balance sheet: cash, debt, equity
        cash_val = balance.get("cash_and_cash_equivalents", {}).get("value")
        if not isinstance(cash_val, (int, float)):
            cash_val = balance.get("cash", {}).get("value")
        if isinstance(cash_val, (int, float)):
            cash_and_equivalents = int(cash_val)

        # Total debt: long-term + short-term
        lt_debt = balance.get("long_term_debt", {}).get("value")
        st_debt = balance.get("short_term_debt", {}).get("value")
        if not isinstance(lt_debt, (int, float)):
            lt_debt = balance.get("noncurrent_liabilities", {}).get("value")
        total_debt_val = 0
        if isinstance(lt_debt, (int, float)):
            total_debt_val += lt_debt
        if isinstance(st_debt, (int, float)):
            total_debt_val += st_debt
        if total_debt_val > 0:
            total_debt = int(total_debt_val)

        equity_val = balance.get("equity", {}).get("value")
        if not isinstance(equity_val, (int, float)):
            equity_val = balance.get("stockholders_equity", {}).get("value")
        if isinstance(equity_val, (int, float)) and equity_val != 0:
            total_equity = equity_val
            if total_debt is not None:
                debt_to_equity = round(total_debt / abs(equity_val), 2)

    if len(results) >= 2:
        income_prior = results[1].get("financials", {}).get("income_statement", {})
        cashflow_prior = results[1].get("financials", {}).get("cash_flow_statement", {})
        revenues_prior = income_prior.get("revenues", {})
        revenue_prior = revenues_prior.get("value")

        if revenue_current is not None and revenue_prior is not None and revenue_prior > 0:
            revenue_growth_pct = round(
                (revenue_current - revenue_prior) / revenue_prior * 100, 2
            )

        # Prior year FCF for growth calc
        op_cf_prior = cashflow_prior.get("net_cash_flow_from_operating_activities", {}).get("value")
        cap_ex_prior = cashflow_prior.get("net_cash_flow_from_investing_activities", {}).get("value")
        if isinstance(op_cf_prior, (int, float)):
            if isinstance(cap_ex_prior, (int, float)):
                free_cash_flow_prior = op_cf_prior + cap_ex_prior
            else:
                free_cash_flow_prior = op_cf_prior

        # Prior year shares for buyback detection
        shares_prior_data = income_prior.get("weighted_average_shares", {}).get("value")
        if isinstance(shares_prior_data, (int, float)):
            shares_outstanding_prior = int(shares_prior_data)

    # Calculate 3-year average revenue growth
    revenue_growth_3yr = None
    valid_revs = [r for r in revenue_history if isinstance(r, (int, float)) and r > 0]
    if len(valid_revs) >= 4:
        # CAGR over 3 years from oldest available
        oldest = valid_revs[max(0, len(valid_revs) - 4)]
        newest = valid_revs[-1]
        if oldest > 0:
            revenue_growth_3yr = round(((newest / oldest) ** (1.0/3.0) - 1) * 100, 2)
    elif len(valid_revs) >= 2:
        oldest = valid_revs[0]
        newest = valid_revs[-1]
        years = len(valid_revs) - 1
        if oldest > 0 and years > 0:
            revenue_growth_3yr = round(((newest / oldest) ** (1.0/years) - 1) * 100, 2)

    # FCF margin
    fcf_margin = None
    if isinstance(free_cash_flow, (int, float)) and isinstance(revenue_current, (int, float)) and revenue_current > 0:
        fcf_margin = round(free_cash_flow / revenue_current * 100, 2)

    # FCF growth YoY
    fcf_growth_yoy = None
    if (isinstance(free_cash_flow, (int, float)) and isinstance(free_cash_flow_prior, (int, float))
            and free_cash_flow_prior != 0):
        fcf_growth_yoy = round((free_cash_flow - free_cash_flow_prior) / abs(free_cash_flow_prior) * 100, 2)

    # Shares outstanding change (negative = buybacks)
    if shares_outstanding is not None and shares_outstanding_prior is not None and shares_outstanding_prior > 0:
        shares_outstanding_change = round(
            (shares_outstanding - shares_outstanding_prior) / shares_outstanding_prior, 4
        )

    # Current gross margin (most recent year)
    gross_margin_current = None
    for gm in reversed(gross_margin_history):
        if gm is not None:
            gross_margin_current = gm
            break

    return {
        "revenue_current": revenue_current,
        "revenue_prior_year": revenue_prior,
        "revenue_growth_pct": revenue_growth_pct,
        "revenue_growth_3yr": revenue_growth_3yr,
        "revenue_history": revenue_history,
        "gross_margin_current": gross_margin_current,
        "gross_margin_history": gross_margin_history,
        "eps": eps if len(results) >= 1 else None,
        "eps_diluted": eps_diluted,
        "net_income": net_income,
        "free_cash_flow": free_cash_flow,
        "fcf_margin": fcf_margin,
        "fcf_growth_yoy": fcf_growth_yoy,
        "capex": capex,
        "cash_and_equivalents": cash_and_equivalents,
        "total_debt": total_debt,
        "debt_to_equity": debt_to_equity,
        "shares_outstanding": shares_outstanding,
        "shares_outstanding_change": shares_outstanding_change,
        "dividend_per_share": dividend_per_share,
    }


async def get_week_52_high(ticker: str) -> float | None:
    """Calculate 52-week high from daily aggregates.
    Endpoint: GET /v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}
    """
    to_date = datetime.now().strftime("%Y-%m-%d")
    from_date = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")

    data = await _get(
        f"/v2/aggs/ticker/{ticker}/range/1/day/{from_date}/{to_date}",
        {"adjusted": "true", "sort": "desc", "limit": 300},
    )
    if not data or not data.get("results"):
        return None

    highs = [r["h"] for r in data["results"] if r.get("h")]
    return max(highs) if highs else None


async def get_historical_prices(ticker: str) -> dict | None:
    """Get weekly (10yr) and monthly (20yr) price history.
    Returns: {"ticker": str, "weekly": [...], "monthly": [...]}
    """
    result = {"ticker": ticker, "weekly": [], "monthly": []}

    # Weekly: 10 years
    to_date = datetime.now().strftime("%Y-%m-%d")
    from_weekly = (datetime.now() - timedelta(days=365 * 10)).strftime("%Y-%m-%d")

    weekly_data = await _get(
        f"/v2/aggs/ticker/{ticker}/range/1/week/{from_weekly}/{to_date}",
        {"adjusted": "true", "sort": "asc", "limit": 50000},
    )
    if weekly_data and weekly_data.get("results"):
        for bar in weekly_data["results"]:
            if bar.get("c") and bar.get("t"):
                dt = datetime.fromtimestamp(bar["t"] / 1000)
                entry = {
                    "date": dt.strftime("%Y-%m-%d"),
                    "close": round(float(bar["c"]), 2),
                }
                if bar.get("v") is not None:
                    entry["volume"] = int(bar["v"])
                result["weekly"].append(entry)

    # Monthly: 20 years
    from_monthly = (datetime.now() - timedelta(days=365 * 20)).strftime("%Y-%m-%d")

    monthly_data = await _get(
        f"/v2/aggs/ticker/{ticker}/range/1/month/{from_monthly}/{to_date}",
        {"adjusted": "true", "sort": "asc", "limit": 50000},
    )
    if monthly_data and monthly_data.get("results"):
        for bar in monthly_data["results"]:
            if bar.get("c") and bar.get("t"):
                dt = datetime.fromtimestamp(bar["t"] / 1000)
                result["monthly"].append({
                    "date": dt.strftime("%Y-%m-%d"),
                    "close": round(float(bar["c"]), 2),
                })

    if not result["weekly"] and not result["monthly"]:
        return None

    return result
