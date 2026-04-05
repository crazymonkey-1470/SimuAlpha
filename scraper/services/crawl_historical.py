import json
import re
from datetime import datetime, timedelta

from .scrape_utils import fetch_html, parse
from .yfinance_source import get_historical_yfinance
from cache.store import historical_cache

CACHE_TTL = 86400  # 24 hours


async def get_historical(ticker: str) -> dict:
    cached = historical_cache.get(f"hist_{ticker}")
    if cached:
        return cached

    # PRIMARY: yfinance (fastest, most reliable)
    try:
        yf_data = await get_historical_yfinance(ticker)
        if yf_data and len(yf_data.get("monthly", [])) >= 24:
            historical_cache.set(f"hist_{ticker}", yf_data, CACHE_TTL)
            return yf_data
    except Exception:
        pass

    result = {"ticker": ticker, "weekly": [], "monthly": []}

    # FALLBACK 1: StockAnalysis
    try:
        url = f"https://stockanalysis.com/stocks/{ticker.lower()}/history/"
        html = await fetch_html(url)
        if html:
            soup = parse(html)
            table = soup.find("table")
            if table:
                rows = table.find_all("tr")[1:]
                monthly = []
                for row in rows:
                    cols = row.find_all("td")
                    if len(cols) >= 5:
                        try:
                            date_str = cols[0].get_text(strip=True)
                            close_str = (
                                cols[4]
                                .get_text(strip=True)
                                .replace(",", "")
                                .replace("$", "")
                            )
                            date = datetime.strptime(date_str, "%B %d, %Y")
                            close = float(close_str)
                            monthly.append(
                                {
                                    "date": date.strftime("%Y-%m-%d"),
                                    "close": close,
                                }
                            )
                        except (ValueError, IndexError):
                            continue
                monthly.sort(key=lambda x: x["date"])
                result["monthly"] = monthly
                result["weekly"] = _interpolate_weekly(monthly)
    except Exception as e:
        print(f"  [Historical] {ticker} error: {e}")

    # FALLBACK 2: Macrotrends (JS required)
    if len(result["monthly"]) < 60:
        try:
            url = f"https://www.macrotrends.net/stocks/charts/{ticker}/{ticker.lower()}/stock-price-history"
            html = await fetch_html(url, needs_js=True)
            if html:
                pattern = r"var chartData = (\[.*?\]);"
                match = re.search(pattern, html, re.DOTALL)
                if match:
                    data = json.loads(match.group(1))
                    monthly = [
                        {"date": item["date"], "close": float(item["close"])}
                        for item in data
                        if item.get("date") and item.get("close")
                    ]
                    monthly.sort(key=lambda x: x["date"])
                    result["monthly"] = monthly
                    result["weekly"] = _interpolate_weekly(monthly)
        except Exception as e:
            print(f"  [Historical] {ticker} Macrotrends error: {e}")

    if result["monthly"]:
        historical_cache.set(f"hist_{ticker}", result, CACHE_TTL)

    return result


def _interpolate_weekly(monthly: list) -> list:
    """Generate approximate weekly closes from monthly data."""
    weekly = []
    for i in range(len(monthly) - 1):
        start_date = datetime.strptime(monthly[i]["date"], "%Y-%m-%d")
        end_date = datetime.strptime(monthly[i + 1]["date"], "%Y-%m-%d")
        start_price = monthly[i]["close"]
        end_price = monthly[i + 1]["close"]
        current = start_date
        while current < end_date:
            days_total = (end_date - start_date).days
            days_elapsed = (current - start_date).days
            ratio = days_elapsed / days_total if days_total > 0 else 0
            price = start_price + (end_price - start_price) * ratio
            weekly.append(
                {"date": current.strftime("%Y-%m-%d"), "close": round(price, 2)}
            )
            current += timedelta(weeks=1)
    return weekly
