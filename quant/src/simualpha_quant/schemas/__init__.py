"""Pydantic v2 schemas — single source of truth for tool I/O."""

from simualpha_quant.schemas.common import ErrorResponse, Meta, SuccessResponse
from simualpha_quant.schemas.fundamentals import (
    FundamentalRecord,
    Fundamentals,
    FundamentalsRequest,
)
from simualpha_quant.schemas.prices import PriceBar, PriceHistory, PriceHistoryRequest

__all__ = [
    "ErrorResponse",
    "FundamentalRecord",
    "Fundamentals",
    "FundamentalsRequest",
    "Meta",
    "PriceBar",
    "PriceHistory",
    "PriceHistoryRequest",
    "SuccessResponse",
]
