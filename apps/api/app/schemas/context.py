from pydantic import BaseModel, Field


class CrossAssetEntry(BaseModel):
    instrument: str = Field(description="Instrument or index identifier")
    last_price: float = Field(description="Most recent price or level")
    change_pct: float = Field(description="Percentage change from prior close")
    volatility_state: str = Field(description="Volatility regime: compressed, normal, elevated")
    trend_state: str = Field(description="Trend classification: uptrend, downtrend, range-bound")
    notes: str = Field(description="Contextual commentary")


class CrossAssetResponse(BaseModel):
    entries: list[CrossAssetEntry]
    as_of: str = Field(description="Timestamp or date these observations reflect")
