"""
Institutional data routes — SEC 13F scraper endpoints.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.crawl_sec_13f import fetch_latest_13f, compute_quarterly_signals, compute_consensus

router = APIRouter()


@router.get("/13f/{cik}")
async def get_13f_filing(cik: str):
    """Fetch the latest 13F-HR filing for a given CIK number."""
    result = await fetch_latest_13f(cik)
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    return result


class HoldingEntry(BaseModel):
    ticker: str | None = None
    cusip: str | None = None
    company_name: str | None = None
    shares: int
    market_value: int
    signal_type: str | None = None
    has_call_options: bool = False
    has_put_options: bool = False
    notes: str | None = None


class ManualHoldingsInput(BaseModel):
    investor_id: str
    quarter: str
    holdings: list[HoldingEntry]


@router.post("/holdings/manual")
async def manual_holdings_entry(data: ManualHoldingsInput):
    """
    Manual data entry endpoint for TLI Money Flow Research reports.
    Returns the holdings in normalized format for Supabase insert.
    """
    normalized = []
    for h in data.holdings:
        normalized.append({
            "investor_id": data.investor_id,
            "quarter": data.quarter,
            "ticker": h.ticker,
            "cusip": h.cusip,
            "company_name": h.company_name,
            "shares": h.shares,
            "market_value": h.market_value,
            "has_call_options": h.has_call_options,
            "has_put_options": h.has_put_options,
        })

    return {
        "investor_id": data.investor_id,
        "quarter": data.quarter,
        "holdings_count": len(normalized),
        "holdings": normalized,
    }
