"""Universe specification — named cohort or explicit ticker list."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

NamedUniverse = Literal["tracked_8500"]
# Stage 3 supports only the locally-resolvable universe + per-request lists.
# Named indexes (sp500/sp1500) are explicitly out of scope for Stage 3.


class UniverseSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    universe: NamedUniverse | None = Field(
        default=None, description="Named cohort. Use this OR `tickers`, not both."
    )
    tickers: list[str] | None = Field(
        default=None, description="Explicit ticker list. Use this OR `universe`."
    )

    @model_validator(mode="after")
    def _xor(self):
        if (self.universe is None) == (self.tickers is None):
            raise ValueError(
                "exactly one of `universe` or `tickers` must be provided"
            )
        if self.tickers is not None:
            cleaned = [t.strip().upper() for t in self.tickers if t and t.strip()]
            if not cleaned:
                raise ValueError("`tickers` must contain at least one symbol")
            object.__setattr__(self, "tickers", cleaned)
        return self
