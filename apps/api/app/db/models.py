"""Database models for SimuAlpha distress-risk intelligence platform."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Date,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_uuid


# ── Auth & Users ──────────────────────────────────────────────────────────


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    full_name: Mapped[str] = mapped_column(String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    refresh_tokens: Mapped[list[RefreshToken]] = relationship(back_populates="user", cascade="all, delete-orphan")
    watchlists: Mapped[list[Watchlist]] = relationship(back_populates="user", cascade="all, delete-orphan")


class RefreshToken(Base, TimestampMixin):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)

    user: Mapped[User] = relationship(back_populates="refresh_tokens")


# ── Distress Reports ─────────────────────────────────────────────────────


class DistressReport(Base):
    __tablename__ = "distress_reports"
    __table_args__ = (
        UniqueConstraint("ticker", "report_version", name="uq_ticker_version"),
        Index("ix_distress_reports_ticker", "ticker"),
        Index("ix_distress_reports_rating", "distress_rating"),
        Index("ix_distress_reports_generated", "generated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False)
    company_name: Mapped[str] = mapped_column(String(256), nullable=False)
    sector: Mapped[str | None] = mapped_column(String(128), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(256), nullable=True)

    # Core assessment
    distress_rating: Mapped[str] = mapped_column(String(20), nullable=False)  # Low / Moderate / High / Severe
    distress_score: Mapped[float] = mapped_column(Float, nullable=False)  # 0-100 scale
    executive_summary: Mapped[str] = mapped_column(Text, nullable=False)

    # Structured analysis sections (JSONB arrays of strings)
    why_safe: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    key_risks: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    stabilizing_factors: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    what_to_watch: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Narrative analysis sections
    liquidity_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    leverage_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    profitability_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    cashflow_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    interest_coverage_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    dilution_risk_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    long_term_trend_analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    hold_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    analyst_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Source data
    source_period_end: Mapped[str | None] = mapped_column(String(32), nullable=True)
    raw_metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    raw_financials: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Metadata
    report_version: Mapped[str] = mapped_column(String(32), nullable=False, default="v1")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="completed")
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    history: Mapped[list[ReportHistory]] = relationship(back_populates="report", cascade="all, delete-orphan")


class ReportHistory(Base):
    __tablename__ = "report_history"
    __table_args__ = (
        Index("ix_report_history_ticker", "ticker"),
        Index("ix_report_history_snapshot", "snapshot_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    report_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("distress_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False)
    snapshot_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    distress_rating: Mapped[str] = mapped_column(String(20), nullable=False)
    distress_score: Mapped[float] = mapped_column(Float, nullable=False)
    raw_metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    report: Mapped[DistressReport] = relationship(back_populates="history")


# ── Watchlists ────────────────────────────────────────────────────────────


class Watchlist(Base):
    __tablename__ = "watchlists"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    user: Mapped[User | None] = relationship(back_populates="watchlists")
    items: Mapped[list[WatchlistItem]] = relationship(back_populates="watchlist", cascade="all, delete-orphan")


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"
    __table_args__ = (
        UniqueConstraint("watchlist_id", "ticker", name="uq_watchlist_ticker"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    watchlist_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=False, index=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    watchlist: Mapped[Watchlist] = relationship(back_populates="items")
