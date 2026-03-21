"""Initial schema — all SimuAlpha persistence tables.

Revision ID: 001
Revises: None
Create Date: 2026-03-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, UUID

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── simulation_runs ────────────────────────────────────────────────
    op.create_table(
        "simulation_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("run_type", sa.String(32), nullable=False, server_default="current"),
        sa.Column("symbol", sa.String(16), nullable=False, server_default="SPY"),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("source", sa.String(32), nullable=False, server_default="worker"),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("warnings", JSON, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("config_snapshot", JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_simulation_runs_symbol_status", "simulation_runs", ["symbol", "status"])
    op.create_index("ix_simulation_runs_completed_at", "simulation_runs", ["completed_at"])

    # ── regime_snapshots ───────────────────────────────────────────────
    op.create_table(
        "regime_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", UUID(as_uuid=True), sa.ForeignKey("simulation_runs.id"), nullable=False),
        sa.Column("symbol", sa.String(16), nullable=False, server_default="SPY"),
        sa.Column("regime", sa.String(64), nullable=False),
        sa.Column("confidence", sa.Float, nullable=False),
        sa.Column("net_pressure", sa.Float, nullable=False),
        sa.Column("posture", sa.Text, nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.Column("drivers", JSON, nullable=True),
        sa.Column("risk_flags", JSON, nullable=True),
        sa.Column("market_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_regime_snapshots_symbol_created", "regime_snapshots", ["symbol", "created_at"])

    # ── actor_states ───────────────────────────────────────────────────
    op.create_table(
        "actor_states",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", UUID(as_uuid=True), sa.ForeignKey("simulation_runs.id"), nullable=False),
        sa.Column("symbol", sa.String(16), nullable=False, server_default="SPY"),
        sa.Column("actor_name", sa.String(128), nullable=False),
        sa.Column("archetype", sa.String(64), nullable=False),
        sa.Column("bias", sa.String(32), nullable=False),
        sa.Column("conviction", sa.Float, nullable=False),
        sa.Column("contribution", sa.Float, nullable=False),
        sa.Column("confidence", sa.Float, nullable=False),
        sa.Column("horizon", sa.String(128), nullable=False),
        sa.Column("rationale", sa.Text, nullable=True),
        sa.Column("sensitivities", JSON, nullable=True),
        sa.Column("recent_change", sa.Text, nullable=True),
        sa.Column("market_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_actor_states_run_id", "actor_states", ["run_id"])

    # ── scenario_branches ──────────────────────────────────────────────
    op.create_table(
        "scenario_branches",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", UUID(as_uuid=True), sa.ForeignKey("simulation_runs.id"), nullable=False),
        sa.Column("symbol", sa.String(16), nullable=False, server_default="SPY"),
        sa.Column("branch_name", sa.String(128), nullable=False),
        sa.Column("probability", sa.Float, nullable=False),
        sa.Column("direction", sa.String(64), nullable=False),
        sa.Column("drivers", JSON, nullable=True),
        sa.Column("invalidation_conditions", JSON, nullable=True),
        sa.Column("actor_reactions", JSON, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("risk_level", sa.String(32), nullable=False),
        sa.Column("market_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_scenario_branches_run_id", "scenario_branches", ["run_id"])

    # ── signal_summaries ───────────────────────────────────────────────
    op.create_table(
        "signal_summaries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", UUID(as_uuid=True), sa.ForeignKey("simulation_runs.id"), nullable=False),
        sa.Column("symbol", sa.String(16), nullable=False, server_default="SPY"),
        sa.Column("bias", sa.String(32), nullable=False),
        sa.Column("confidence", sa.Float, nullable=False),
        sa.Column("time_horizon", sa.String(64), nullable=False),
        sa.Column("suggested_posture", sa.Text, nullable=False),
        sa.Column("warnings", JSON, nullable=True),
        sa.Column("change_vs_prior", sa.Text, nullable=True),
        sa.Column("market_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_signal_summaries_symbol_created", "signal_summaries", ["symbol", "created_at"])

    # ── replay_runs ────────────────────────────────────────────────────
    op.create_table(
        "replay_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("symbol", sa.String(16), nullable=False, server_default="SPY"),
        sa.Column("start_date", sa.String(10), nullable=False),
        sa.Column("end_date", sa.String(10), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("frame_count", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── replay_frames ──────────────────────────────────────────────────
    op.create_table(
        "replay_frames",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("replay_run_id", UUID(as_uuid=True), sa.ForeignKey("replay_runs.id"), nullable=False),
        sa.Column("symbol", sa.String(16), nullable=False, server_default="SPY"),
        sa.Column("frame_date", sa.String(10), nullable=False),
        sa.Column("regime", sa.String(64), nullable=False),
        sa.Column("regime_confidence", sa.Float, nullable=False),
        sa.Column("net_pressure", sa.Float, nullable=False),
        sa.Column("signal_bias", sa.String(32), nullable=True),
        sa.Column("realized_outcome", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("snapshot_payload", JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_replay_frames_run_date", "replay_frames", ["replay_run_id", "frame_date"])
    op.create_index("ix_replay_frames_symbol_date", "replay_frames", ["symbol", "frame_date"])

    # ── calibration_runs ───────────────────────────────────────────────
    op.create_table(
        "calibration_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("symbol", sa.String(16), nullable=False, server_default="SPY"),
        sa.Column("period_name", sa.String(128), nullable=True),
        sa.Column("start_date", sa.String(10), nullable=False),
        sa.Column("end_date", sa.String(10), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("metrics", JSON, nullable=True),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── system_status ──────────────────────────────────────────────────
    op.create_table(
        "system_status",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("last_data_refresh", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_successful_simulation", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_successful_calibration", sa.DateTime(timezone=True), nullable=True),
        sa.Column("worker_status", sa.String(32), server_default="unknown"),
        sa.Column("warnings", JSON, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("system_status")
    op.drop_table("calibration_runs")
    op.drop_table("replay_frames")
    op.drop_table("replay_runs")
    op.drop_table("signal_summaries")
    op.drop_table("scenario_branches")
    op.drop_table("actor_states")
    op.drop_table("regime_snapshots")
    op.drop_table("simulation_runs")
