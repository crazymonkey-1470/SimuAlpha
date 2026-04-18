"""Tool registry — the single place every capability gets listed.

Adding a new tool means:

1. Implement a pure function in `simualpha_quant.tools.<name>`.
2. Define its request/response Pydantic models in `simualpha_quant.schemas`.
3. Add one `ToolSpec` entry to `TOOLS` below.

The FastAPI app and the MCP server both iterate this list — do NOT add
transport-specific wiring elsewhere.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from pydantic import BaseModel

from simualpha_quant.schemas.fundamentals import Fundamentals, FundamentalsRequest
from simualpha_quant.schemas.prices import PriceHistory, PriceHistoryRequest
from simualpha_quant.tools.get_fundamentals import get_fundamentals
from simualpha_quant.tools.get_price_history import get_price_history


@dataclass(frozen=True)
class ToolSpec:
    name: str
    http_route: str
    mcp_name: str
    description: str
    request_model: type[BaseModel]
    response_model: type[BaseModel]
    handler: Callable[[BaseModel], BaseModel]


TOOLS: tuple[ToolSpec, ...] = (
    ToolSpec(
        name="get_price_history",
        http_route="/v1/tools/price-history",
        mcp_name="get_price_history",
        description=(
            "Return daily OHLCV for a single ticker between two dates. "
            "Cache-first against Supabase prices_daily; backfills from "
            "OpenBB on miss or gap at either end of the window."
        ),
        request_model=PriceHistoryRequest,
        response_model=PriceHistory,
        handler=get_price_history,
    ),
    ToolSpec(
        name="get_fundamentals",
        http_route="/v1/tools/fundamentals",
        mcp_name="get_fundamentals",
        description=(
            "Return latest quarterly TLI-scoring fundamentals (revenue, "
            "ebitda, free_cash_flow, shares_outstanding, total_debt, cash, "
            "gross_margin, operating_margin, net_income) for a ticker. "
            "Cache-first; refreshes from OpenBB when the newest cached "
            "period is older than one quarter."
        ),
        request_model=FundamentalsRequest,
        response_model=Fundamentals,
        handler=get_fundamentals,
    ),
)


def by_name(name: str) -> ToolSpec:
    for spec in TOOLS:
        if spec.name == name or spec.mcp_name == name:
            return spec
    raise KeyError(f"unknown tool: {name!r}")
