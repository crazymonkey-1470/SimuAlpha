"""Persistent domain models for SimuAlpha."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, new_uuid


# ── Simulation Run ─────────────────────────────────────────────────────────


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    run_type: Mapped[str] = mapped_column(String(32), nullable=False, default="current")
    symbol: Mapped[str] = mapped_column(String(16), nullable=False, default="SPY")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="worker")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    warnings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    config_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now()
    )
    queued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # relationships
    regime_snapshots: Mapped[list[RegimeSnapshotRecord]] = relationship(back_populates="run", cascade="all, delete-orphan")
    actor_states: Mapped[list[ActorStateRecord]] = relationship(back_populates="run", cascade="all, delete-orphan")
    scenario_branches: Mapped[list[ScenarioBranchRecord]] = relationship(back_populates="run", cascade="all, delete-orphan")
    signal_summaries: Mapped[list[SignalSummaryRecord]] = relationship(back_populates="run", cascade="all, delete-orphan")


# ── Regime Snapshot ────────────────────────────────────────────────────────


class RegimeSnapshotRecord(Base):
    __tablename__ = "regime_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("simulation_runs.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False, default="SPY")
    regime: Mapped[str] = mapped_column(String(64), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    net_pressure: Mapped[float] = mapped_column(Float, nullable=False)
    posture: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    drivers: Mapped[list | None] = mapped_column(JSON, nullable=True)
    risk_flags: Mapped[list | None] = mapped_column(JSON, nullable=True)
    market_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now()
    )

    run: Mapped[SimulationRun] = relationship(back_populates="regime_snapshots")


# ── Actor State ────────────────────────────────────────────────────────────


class ActorStateRecord(Base):
    __tablename__ = "actor_states"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("simulation_runs.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False, default="SPY")
    actor_name: Mapped[str] = mapped_column(String(128), nullable=False)
    archetype: Mapped[str] = mapped_column(String(64), nullable=False)
    bias: Mapped[str] = mapped_column(String(32), nullable=False)
    conviction: Mapped[float] = mapped_column(Float, nullable=False)
    contribution: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    horizon: Mapped[str] = mapped_column(String(128), nullable=False)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    sensitivities: Mapped[list | None] = mapped_column(JSON, nullable=True)
    recent_change: Mapped[str | None] = mapped_column(Text, nullable=True)
    market_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now()
    )

    run: Mapped[SimulationRun] = relationship(back_populates="actor_states")


# ── Scenario Branch ────────────────────────────────────────────────────────


class ScenarioBranchRecord(Base):
    __tablename__ = "scenario_branches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("simulation_runs.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False, default="SPY")
    branch_name: Mapped[str] = mapped_column(String(128), nullable=False)
    probability: Mapped[float] = mapped_column(Float, nullable=False)
    direction: Mapped[str] = mapped_column(String(64), nullable=False)
    drivers: Mapped[list | None] = mapped_column(JSON, nullable=True)
    invalidation_conditions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    actor_reactions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(32), nullable=False)
    market_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now()
    )

    run: Mapped[SimulationRun] = relationship(back_populates="scenario_branches")


# ── Signal Summary ─────────────────────────────────────────────────────────


class SignalSummaryRecord(Base):
    __tablename__ = "signal_summaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("simulation_runs.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False, default="SPY")
    bias: Mapped[str] = mapped_column(String(32), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    time_horizon: Mapped[str] = mapped_column(String(64), nullable=False)
    suggested_posture: Mapped[str] = mapped_column(Text, nullable=False)
    warnings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    change_vs_prior: Mapped[str | None] = mapped_column(Text, nullable=True)
    market_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now()
    )

    run: Mapped[SimulationRun] = relationship(back_populates="signal_summaries")


# ── Replay Run ─────────────────────────────────────────────────────────────


class ReplayRun(Base):
    __tablename__ = "replay_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False, default="SPY")
    start_date: Mapped[str] = mapped_column(String(10), nullable=False)
    end_date: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="worker")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    frame_count: Mapped[int] = mapped_column(Integer, nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    frames: Mapped[list[ReplayFrameRecord]] = relationship(back_populates="replay_run", cascade="all, delete-orphan")


# ── Replay Frame ───────────────────────────────────────────────────────────


class ReplayFrameRecord(Base):
    __tablename__ = "replay_frames"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    replay_run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("replay_runs.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False, default="SPY")
    frame_date: Mapped[str] = mapped_column(String(10), nullable=False)
    regime: Mapped[str] = mapped_column(String(64), nullable=False)
    regime_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    net_pressure: Mapped[float] = mapped_column(Float, nullable=False)
    signal_bias: Mapped[str | None] = mapped_column(String(32), nullable=True)
    realized_outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    snapshot_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now()
    )

    replay_run: Mapped[ReplayRun] = relationship(back_populates="frames")


# ── Calibration Run ────────────────────────────────────────────────────────


class CalibrationRun(Base):
    __tablename__ = "calibration_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    symbol: Mapped[str] = mapped_column(String(16), nullable=False, default="SPY")
    period_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    start_date: Mapped[str] = mapped_column(String(10), nullable=False)
    end_date: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="worker")
    metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ── System Status ──────────────────────────────────────────────────────────


class SystemStatusRecord(Base):
    __tablename__ = "system_status"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    last_data_refresh: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_successful_simulation: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_successful_calibration: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    worker_status: Mapped[str] = mapped_column(String(32), default="unknown")
    warnings: Mapped[list | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now()
    )
