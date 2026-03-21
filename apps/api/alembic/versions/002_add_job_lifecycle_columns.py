"""Add job lifecycle columns for queue integration.

Revision ID: 002
Revises: 001
Create Date: 2026-03-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add worker_id and retry_count to simulation_runs
    op.add_column("simulation_runs", sa.Column("worker_id", sa.String(128), nullable=True))
    op.add_column("simulation_runs", sa.Column("retry_count", sa.Integer, server_default="0", nullable=False))
    op.add_column("simulation_runs", sa.Column("queued_at", sa.DateTime(timezone=True), nullable=True))

    # Add started_at to replay_runs (was missing)
    op.add_column("replay_runs", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("replay_runs", sa.Column("error_message", sa.Text, nullable=True))
    op.add_column("replay_runs", sa.Column("worker_id", sa.String(128), nullable=True))
    op.add_column("replay_runs", sa.Column("source", sa.String(32), server_default="worker", nullable=False))

    # Add started_at and worker tracking to calibration_runs
    op.add_column("calibration_runs", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("calibration_runs", sa.Column("error_message", sa.Text, nullable=True))
    op.add_column("calibration_runs", sa.Column("worker_id", sa.String(128), nullable=True))
    op.add_column("calibration_runs", sa.Column("source", sa.String(32), server_default="worker", nullable=False))

    # Add indexes for job monitoring queries
    op.create_index("ix_simulation_runs_created_at", "simulation_runs", ["created_at"])
    op.create_index("ix_replay_runs_status", "replay_runs", ["status"])
    op.create_index("ix_calibration_runs_status", "calibration_runs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_calibration_runs_status")
    op.drop_index("ix_replay_runs_status")
    op.drop_index("ix_simulation_runs_created_at")

    op.drop_column("calibration_runs", "source")
    op.drop_column("calibration_runs", "worker_id")
    op.drop_column("calibration_runs", "error_message")
    op.drop_column("calibration_runs", "started_at")

    op.drop_column("replay_runs", "source")
    op.drop_column("replay_runs", "worker_id")
    op.drop_column("replay_runs", "error_message")
    op.drop_column("replay_runs", "started_at")

    op.drop_column("simulation_runs", "queued_at")
    op.drop_column("simulation_runs", "retry_count")
    op.drop_column("simulation_runs", "worker_id")
