"""Create distress reports schema and drop old simulation tables.

Revision ID: 004
Revises: 003
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Create new distress reports table ──
    op.create_table(
        "distress_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("ticker", sa.String(20), nullable=False),
        sa.Column("company_name", sa.String(256), nullable=False),
        sa.Column("sector", sa.String(128), nullable=True),
        sa.Column("industry", sa.String(256), nullable=True),
        sa.Column("distress_rating", sa.String(20), nullable=False),
        sa.Column("distress_score", sa.Float, nullable=False),
        sa.Column("executive_summary", sa.Text, nullable=False),
        sa.Column("key_risks", postgresql.JSONB, nullable=True),
        sa.Column("stabilizing_factors", postgresql.JSONB, nullable=True),
        sa.Column("what_to_watch", postgresql.JSONB, nullable=True),
        sa.Column("liquidity_analysis", sa.Text, nullable=True),
        sa.Column("leverage_analysis", sa.Text, nullable=True),
        sa.Column("profitability_analysis", sa.Text, nullable=True),
        sa.Column("cashflow_analysis", sa.Text, nullable=True),
        sa.Column("interest_coverage_analysis", sa.Text, nullable=True),
        sa.Column("dilution_risk_analysis", sa.Text, nullable=True),
        sa.Column("refinancing_risk_analysis", sa.Text, nullable=True),
        sa.Column("analyst_notes", sa.Text, nullable=True),
        sa.Column("source_period_end", sa.String(32), nullable=True),
        sa.Column("raw_metrics", postgresql.JSONB, nullable=True),
        sa.Column("raw_financials", postgresql.JSONB, nullable=True),
        sa.Column("report_version", sa.String(32), nullable=False, server_default="v1"),
        sa.Column("status", sa.String(20), nullable=False, server_default="completed"),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("ticker", "report_version", name="uq_ticker_version"),
    )
    op.create_index("ix_distress_reports_ticker", "distress_reports", ["ticker"])
    op.create_index("ix_distress_reports_rating", "distress_reports", ["distress_rating"])
    op.create_index("ix_distress_reports_generated", "distress_reports", ["generated_at"])

    # ── Create report history table ──
    op.create_table(
        "report_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("distress_reports.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ticker", sa.String(20), nullable=False),
        sa.Column("snapshot_date", sa.Date, nullable=False),
        sa.Column("distress_rating", sa.String(20), nullable=False),
        sa.Column("distress_score", sa.Float, nullable=False),
        sa.Column("raw_metrics", postgresql.JSONB, nullable=True),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_report_history_report_id", "report_history", ["report_id"])
    op.create_index("ix_report_history_ticker", "report_history", ["ticker"])
    op.create_index("ix_report_history_snapshot", "report_history", ["snapshot_date"])

    # ── Drop old simulation tables ──
    for table in [
        "signal_summaries", "scenario_branches", "actor_states", "regime_snapshots",
        "replay_frames", "replay_runs", "calibration_runs", "simulation_runs",
        "system_status", "saved_views", "replay_bookmarks", "user_preferences",
        "workspace_memberships", "workspaces",
    ]:
        op.drop_table(table) if _table_exists(table) else None

    # ── Simplify watchlists (remove workspace dependency) ──
    # Drop old watchlist tables and recreate simplified versions
    if _table_exists("watchlist_items"):
        op.drop_table("watchlist_items")
    if _table_exists("watchlists"):
        op.drop_table("watchlists")

    op.create_table(
        "watchlists",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_watchlists_user_id", "watchlists", ["user_id"])

    op.create_table(
        "watchlist_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("watchlist_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ticker", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("watchlist_id", "ticker", name="uq_watchlist_ticker"),
    )
    op.create_index("ix_watchlist_items_watchlist_id", "watchlist_items", ["watchlist_id"])


def _table_exists(name: str) -> bool:
    from sqlalchemy import inspect
    from alembic import context
    bind = context.get_bind()
    inspector = inspect(bind)
    return name in inspector.get_table_names()


def downgrade() -> None:
    op.drop_table("watchlist_items")
    op.drop_table("watchlists")
    op.drop_table("report_history")
    op.drop_table("distress_reports")
