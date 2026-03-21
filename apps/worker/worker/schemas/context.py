"""Cross-asset context domain models aligned with API contracts."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CrossAssetEntry(BaseModel):
    instrument: str = Field(description="Instrument or index identifier")
    last_price: float = Field(description="Most recent price or level")
    change_pct: float = Field(description="Percentage change from prior close")
    volatility_state: str = Field(description="compressed, normal, elevated")
    trend_state: str = Field(description="uptrend, downtrend, range-bound")
    notes: str = Field(description="Contextual commentary")
