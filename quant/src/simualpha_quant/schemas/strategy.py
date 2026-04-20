"""StrategySpec DSL for the simulate_strategy tool.

OpenClaw composes a full plan (entry + tranche ladder + exit legs +
stop + position sizing) and the simulate engine runs it end-to-end.

Key semantics documented with the fields:

- ``Tranche.pct_of_position`` — fraction of the **planned total
  position** (NOT of remaining capital). Sum across all tranches must
  equal 1.0. The engine computes each tranche's USD stake as
  ``pct_of_position * planned_total_usd`` at trade open, where
  planned_total_usd comes from ``position_sizing``.

- ``ExitLeg.pct_of_position`` — fraction of the **planned total
  position** as well, same convention. Sum across exit legs may be ≤
  1.0; residual (if any) rides the stop-loss / time-stop.

- ``ExitRules.take_profit`` — evaluated in **spec order** (first leg
  whose price is hit fires first). Two legs with identical price
  rules are rejected at validation time; the engine never silently
  reorders.
"""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from simualpha_quant.schemas.charts import DateRange
from simualpha_quant.schemas.universe import UniverseSpec

# ─────────────────────────── price rules ─────────────────────────────


PriceRuleType = Literal["at_signal", "at_price", "at_fib", "at_ma"]


class PriceRule(BaseModel):
    """Resolves to a concrete dollar price at trade time.

    - ``at_signal`` — the close at the bar the entry signal fired.
    - ``at_price`` — literal price (``price`` field).
    - ``at_fib`` — Fibonacci retracement of the currently-developing
      Wave 1 (``level`` field, e.g. 0.382, 0.5, 0.618, 0.786).
    - ``at_ma`` — moving-average value at the bar (``period`` +
      ``freq`` in {daily, weekly, monthly}).
    """

    model_config = ConfigDict(extra="forbid")
    type: PriceRuleType
    price: float | None = None
    level: float | None = None
    period: int | None = None
    freq: Literal["daily", "weekly", "monthly"] | None = None

    @model_validator(mode="after")
    def _validate_by_type(self):
        if self.type == "at_price":
            if self.price is None or self.price <= 0:
                raise ValueError("at_price requires a positive 'price'")
        elif self.type == "at_fib":
            if self.level is None or not (0.0 < self.level < 4.0):
                raise ValueError("at_fib requires 'level' in (0, 4.0)")
        elif self.type == "at_ma":
            if self.period is None or self.period <= 0:
                raise ValueError("at_ma requires a positive 'period'")
            if self.freq is None:
                raise ValueError("at_ma requires 'freq' (daily/weekly/monthly)")
        return self

    def canonical_key(self) -> str:
        """Stable string used by the duplicate-rule validator."""
        parts = [self.type]
        if self.price is not None:
            parts.append(f"price={self.price:.10g}")
        if self.level is not None:
            parts.append(f"level={self.level:.10g}")
        if self.period is not None:
            parts.append(f"period={self.period}")
        if self.freq is not None:
            parts.append(f"freq={self.freq}")
        return "|".join(parts)


# ─────────────────────────── tranches + exits ────────────────────────


class Tranche(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pct_of_position: float = Field(
        ..., gt=0, le=1,
        description="Fraction of the PLANNED TOTAL position (not remaining).",
    )
    price_rule: PriceRule


class ExitLeg(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pct_of_position: float = Field(
        ..., gt=0, le=1,
        description="Fraction of the PLANNED TOTAL position (not remaining).",
    )
    price_rule: PriceRule


StopType = Literal["hard", "trailing"]


class StopLoss(BaseModel):
    model_config = ConfigDict(extra="forbid")
    price_rule: PriceRule
    type: StopType = "hard"


class EntryRules(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # XOR: exactly one of pattern_name or custom_expression.
    pattern_name: str | None = None
    custom_expression: dict[str, Any] | None = None

    # Default ladder: same 5-tranche schedule the backend skill layer uses
    # (see backend/skills/technical/position_sizing.js Sprint 10B).
    tranches: list[Tranche] = Field(
        default_factory=lambda: [
            Tranche(pct_of_position=0.10, price_rule=PriceRule(type="at_signal")),
            Tranche(pct_of_position=0.15, price_rule=PriceRule(type="at_fib", level=0.382)),
            Tranche(pct_of_position=0.20, price_rule=PriceRule(type="at_fib", level=0.500)),
            Tranche(pct_of_position=0.25, price_rule=PriceRule(type="at_fib", level=0.618)),
            Tranche(pct_of_position=0.30, price_rule=PriceRule(type="at_fib", level=0.786)),
        ]
    )

    @model_validator(mode="after")
    def _validate(self):
        if (self.pattern_name is None) == (self.custom_expression is None):
            raise ValueError(
                "entry: exactly one of pattern_name or custom_expression must be set"
            )
        total = sum(t.pct_of_position for t in self.tranches)
        if abs(total - 1.0) > 1e-6:
            raise ValueError(
                f"tranches.pct_of_position must sum to 1.0, got {total:.6f}"
            )
        # Duplicate-rule guard — never silently reorder.
        keys = [t.price_rule.canonical_key() for t in self.tranches]
        dupes = {k for k in keys if keys.count(k) > 1}
        if dupes:
            raise ValueError(
                f"duplicate tranche price_rule(s): {sorted(dupes)}. "
                "Each tranche must have a distinct price rule."
            )
        return self


class ExitRules(BaseModel):
    model_config = ConfigDict(extra="forbid")
    take_profit: list[ExitLeg] = Field(default_factory=list)
    stop_loss: StopLoss
    time_stop_days: int | None = Field(
        default=None, gt=0,
        description="Close the trade if still open after N calendar days. Optional.",
    )

    @model_validator(mode="after")
    def _validate(self):
        # Sum of exit legs may be <= 1.0 (residual exits via stop / time).
        total = sum(leg.pct_of_position for leg in self.take_profit)
        if total > 1.0 + 1e-6:
            raise ValueError(
                f"take_profit legs sum to {total:.6f} (>1.0); max is 1.0"
            )
        # Duplicate-rule guard (spec order is the tie-breaker contract,
        # so two legs with the same price_rule would be ambiguous).
        keys = [leg.price_rule.canonical_key() for leg in self.take_profit]
        dupes = {k for k in keys if keys.count(k) > 1}
        if dupes:
            raise ValueError(
                f"duplicate take_profit price_rule(s): {sorted(dupes)}. "
                "Never silently reorder — pick distinct rules per leg."
            )
        return self


# ─────────────────────────── sizing ──────────────────────────────────


class PositionSizing(BaseModel):
    model_config = ConfigDict(extra="forbid")
    method: Literal["fixed", "volatility_target", "kelly_fraction"] = "fixed"
    params: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _validate(self):
        if self.method == "fixed":
            stake = self.params.get("stake_usd")
            if stake is None or float(stake) <= 0:
                raise ValueError("fixed sizing requires params.stake_usd > 0")
        elif self.method == "volatility_target":
            tv = self.params.get("target_vol_pct")
            ap = self.params.get("atr_period")
            if tv is None or float(tv) <= 0:
                raise ValueError("volatility_target requires params.target_vol_pct > 0")
            if ap is None or int(ap) <= 0:
                raise ValueError("volatility_target requires params.atr_period > 0")
        elif self.method == "kelly_fraction":
            kf = self.params.get("kelly_fraction")
            if kf is None or not (0.0 < float(kf) <= 1.0):
                raise ValueError("kelly_fraction requires params.kelly_fraction in (0, 1]")
        return self


# ─────────────────────────── execution config ───────────────────────
#
# The pure-Python equity backtester (replacing freqtrade as of Stage
# 4.x-rewrite) reads a small ExecutionConfig block off StrategySpec
# to parameterize three things that used to be freqtrade-implicit:
# slippage, fees, and same-bar exit tie-breaking.
#
# All fields have defaults that preserve the semantics every existing
# StrategySpec was validated against. A spec that omits ``execution``
# entirely still parses and runs identically to the freqtrade-era
# behavior for the matching surfaces (zero slippage, zero fees,
# stop-wins when stop and TP trigger on the same bar).
#
# THREE-WAY DISTINCTION (spread / slippage / fees) — not modeled
# individually; collapsed to a single ``slippage_bps`` knob applied
# adversely (adds to buys, subtracts from sells) and a single
# ``fee_bps`` knob applied to gross notional. Spread is implicitly
# folded into slippage for equity daily-bar backtests; we don't have
# bid/ask in daily OHLCV, so modeling spread separately would be
# pseudo-precision. See docs/strategy-dsl.md for the full treatment.


class ExecutionConfig(BaseModel):
    """Execution-layer knobs for the pure-Python equity backtester.

    Every field has a default that produces the simplest possible
    backtest (zero friction, stop-wins-on-ties), matching the
    freqtrade-era defaults. Specs without an ``execution`` block
    validate and run identically.
    """

    model_config = ConfigDict(extra="forbid")

    slippage_bps: float = Field(
        default=0.0,
        ge=0.0,
        le=500.0,
        description=(
            "Slippage applied ADVERSELY per fill in basis points "
            "(0.01% each). Buys add, sells subtract. NOT symmetric "
            "noise — it always hurts the strategy. A buy at a "
            "trigger price of $100 with slippage_bps=10 fills at "
            "$100.10. A sell at $200 with the same slippage fills "
            "at $199.80. Zero default is defensible for daily-bar "
            "equity backtests; add 3-10 bps for a realism pass."
        ),
    )
    fee_bps: float = Field(
        default=0.0,
        ge=0.0,
        le=500.0,
        description=(
            "Commission / fees as basis points of gross notional, "
            "applied on both entry and exit fills. Zero default "
            "matches US retail commission-free trading. Apply "
            "~2 bps to model SEC/FINRA round-trip fees; higher "
            "values approximate professional / non-US brokers."
        ),
    )
    same_bar_priority: Literal["stop", "tp"] = Field(
        default="stop",
        description=(
            "Tie-breaker when a stop and a take-profit both "
            "trigger on the same daily bar. 'stop' assumes the "
            "stop was hit first (conservative, avoids over- "
            "reporting wins). 'tp' assumes TP fills first, stop "
            "exits any residual; use when the stop sits "
            "structurally far from entry (TLI strategies where "
            "the stop is a 0.786 Wave-1 fib and TPs are Wave-3 "
            "extensions). Reserved future value: 'time_weighted' "
            "(prorate by distance from entry — not yet "
            "implemented; adding it will extend this Literal)."
        ),
    )


# ─────────────────────────── top-level spec ──────────────────────────


DEFAULT_HORIZONS_MONTHS: tuple[int, ...] = (3, 6, 12, 24)


class StrategySpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entry: EntryRules
    exit: ExitRules
    position_sizing: PositionSizing

    universe_spec: UniverseSpec
    date_range: DateRange
    horizons: list[int] = Field(default=list(DEFAULT_HORIZONS_MONTHS))

    initial_capital: float = Field(default=100_000.0, gt=0)
    max_open_positions: int = Field(default=10, gt=0, le=200)
    execution: ExecutionConfig = Field(default_factory=ExecutionConfig)

    @field_validator("horizons")
    @classmethod
    def _horizons(cls, v: list[int]) -> list[int]:
        if not v:
            raise ValueError("horizons must contain at least one positive integer")
        for h in v:
            if h <= 0:
                raise ValueError(f"horizon must be positive: {h}")
        return sorted(set(v))

    def canonical_json(self) -> str:
        """Stable serialization for hashing."""
        return json.dumps(self.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), default=str)
