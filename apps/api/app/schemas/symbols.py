"""Schemas for symbol-level drilldown, watchlist intelligence, and comparison."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# ── Symbol overview ─────────────────────────────────────────────────────


class SymbolRegime(BaseModel):
    regime: str
    confidence: float
    net_pressure: float
    posture: str
    risk_flags: list[str] = Field(default_factory=list)
    summary: str
    updated_at: datetime


class SymbolSignal(BaseModel):
    bias: str
    confidence: float
    time_horizon: str
    suggested_posture: str
    warnings: list[str] = Field(default_factory=list)
    change_vs_prior: str


class SymbolActorSummary(BaseModel):
    name: str
    archetype: str
    bias: str
    conviction: float
    contribution: float
    confidence: float


class SymbolScenarioSummary(BaseModel):
    name: str
    probability: float
    direction: str
    risk_level: str
    is_base_case: bool = False


class SymbolOverview(BaseModel):
    symbol: str
    regime: SymbolRegime | None = None
    signal: SymbolSignal | None = None
    actors: list[SymbolActorSummary] = Field(default_factory=list)
    scenarios: list[SymbolScenarioSummary] = Field(default_factory=list)
    dominant_actor: str | None = None
    fragility: str = "unknown"
    warning_count: int = 0
    last_simulation_at: datetime | None = None
    run_id: str | None = None


# ── History timeline ─────────────────────────────────────────────────────


class SymbolTimelineEntry(BaseModel):
    date: str
    regime: str
    regime_confidence: float
    net_pressure: float
    signal_bias: str | None = None
    signal_confidence: float | None = None


class SymbolHistoryResponse(BaseModel):
    symbol: str
    entries: list[SymbolTimelineEntry]
    total: int


# ── Replay frames for a symbol ──────────────────────────────────────────


class SymbolReplayFrame(BaseModel):
    date: str
    regime: str
    regime_confidence: float
    net_pressure: float
    signal_bias: str | None = None
    notes: str | None = None
    realized_outcome: str | None = None


class SymbolReplayResponse(BaseModel):
    symbol: str
    frames: list[SymbolReplayFrame]
    total: int


# ── Watchlist intelligence ───────────────────────────────────────────────


class WatchlistSymbolIntel(BaseModel):
    symbol: str
    regime: str | None = None
    regime_confidence: float | None = None
    signal_bias: str | None = None
    signal_confidence: float | None = None
    fragility: str = "unknown"
    dominant_actor: str | None = None
    base_scenario: str | None = None
    base_scenario_probability: float | None = None
    warning_count: int = 0
    risk_flags: list[str] = Field(default_factory=list)
    last_simulation_at: datetime | None = None


class WatchlistIntelligenceResponse(BaseModel):
    watchlist_id: str
    watchlist_name: str
    symbols: list[WatchlistSymbolIntel]
    regime_distribution: dict[str, int] = Field(default_factory=dict)
    signal_distribution: dict[str, int] = Field(default_factory=dict)
    highest_fragility: list[str] = Field(default_factory=list)
    strongest_conviction: list[str] = Field(default_factory=list)
    total_warnings: int = 0


# ── Compare ──────────────────────────────────────────────────────────────


class CompareEntry(BaseModel):
    symbol: str
    regime: str | None = None
    regime_confidence: float | None = None
    net_pressure: float | None = None
    signal_bias: str | None = None
    signal_confidence: float | None = None
    dominant_actor: str | None = None
    fragility: str = "unknown"
    base_scenario: str | None = None
    base_scenario_direction: str | None = None
    posture: str | None = None
    warning_count: int = 0
    last_simulation_at: datetime | None = None


class CompareResponse(BaseModel):
    symbols: list[CompareEntry]
    compared_at: datetime
