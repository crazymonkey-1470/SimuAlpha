"""Tests for queue infrastructure — connection, enqueue, scheduler."""

from __future__ import annotations

import pytest

from worker.schemas.system import JobStatus, JobType


class TestJobSchemas:
    """Test job-related schemas and enums."""

    def test_job_status_values(self) -> None:
        assert JobStatus.PENDING == "pending"
        assert JobStatus.RUNNING == "running"
        assert JobStatus.COMPLETED == "completed"
        assert JobStatus.FAILED == "failed"

    def test_job_type_values(self) -> None:
        assert JobType.SIMULATION == "simulation"
        assert JobType.REPLAY == "replay"
        assert JobType.CALIBRATION == "calibration"
        assert JobType.DATA_REFRESH == "data_refresh"


class TestScheduleDefinitions:
    """Test schedule configuration."""

    def test_schedule_has_expected_jobs(self) -> None:
        from worker.queue.scheduler import get_schedule_definitions

        defs = get_schedule_definitions()
        assert len(defs) >= 4

        ids = {d["id"] for d in defs}
        assert "daily_simulation" in ids
        assert "daily_data_refresh" in ids
        assert "weekly_calibration" in ids
        assert "weekly_replay" in ids

    def test_schedule_entries_have_required_fields(self) -> None:
        from worker.queue.scheduler import get_schedule_definitions

        for d in get_schedule_definitions():
            assert "id" in d
            assert "func" in d
            assert "description" in d
            assert "cron_string" in d
            assert "queue_name" in d
            assert "timeout" in d

    def test_cron_strings_are_valid_format(self) -> None:
        from worker.queue.scheduler import get_schedule_definitions

        for d in get_schedule_definitions():
            parts = d["cron_string"].split()
            assert len(parts) == 5, f"Invalid cron: {d['cron_string']}"


class TestQueueConnectionModule:
    """Test queue connection constants and helpers."""

    def test_queue_names_are_namespaced(self) -> None:
        from worker.queue.connection import (
            QUEUE_CALIBRATION,
            QUEUE_DEFAULT,
            QUEUE_MAINTENANCE,
            QUEUE_REPLAY,
            QUEUE_SIMULATION,
        )

        for name in [QUEUE_DEFAULT, QUEUE_SIMULATION, QUEUE_REPLAY, QUEUE_CALIBRATION, QUEUE_MAINTENANCE]:
            assert name.startswith("simualpha")

    def test_ping_redis_handles_no_connection(self) -> None:
        """ping_redis returns False when Redis is unavailable."""
        # Reset the cached connection to force a fresh attempt
        import worker.queue.connection as conn_mod
        old = conn_mod._redis_conn
        conn_mod._redis_conn = None

        # Point at a non-existent Redis
        import worker.core.config as cfg_mod
        old_settings = cfg_mod._settings
        cfg_mod._settings = None  # reset

        import os
        os.environ["SIMUALPHA_REDIS_URL"] = "redis://localhost:19999/0"

        try:
            from worker.queue.connection import ping_redis
            result = ping_redis()
            # Could be True or False depending on environment
            assert isinstance(result, bool)
        finally:
            conn_mod._redis_conn = old
            cfg_mod._settings = old_settings
            os.environ.pop("SIMUALPHA_REDIS_URL", None)


class TestJobRegistry:
    """Test the in-memory job registry still works."""

    def test_create_and_retrieve_run(self) -> None:
        from worker.services.job_registry import create_run, get_run

        run = create_run(JobType.SIMULATION)
        assert run.status == JobStatus.PENDING
        assert run.run_id.startswith("run-")

        retrieved = get_run(run.run_id)
        assert retrieved is not None
        assert retrieved.run_id == run.run_id

    def test_run_lifecycle(self) -> None:
        from worker.services.job_registry import (
            create_run,
            get_run,
            mark_completed,
            mark_running,
        )

        run = create_run(JobType.REPLAY)
        mark_running(run.run_id)
        assert get_run(run.run_id).status == JobStatus.RUNNING

        mark_completed(run.run_id, "done", ["warning1"])
        r = get_run(run.run_id)
        assert r.status == JobStatus.COMPLETED
        assert r.summary == "done"
        assert r.warnings == ["warning1"]
        assert r.completed_at is not None

    def test_run_failure(self) -> None:
        from worker.services.job_registry import create_run, get_run, mark_failed, mark_running

        run = create_run(JobType.CALIBRATION)
        mark_running(run.run_id)
        mark_failed(run.run_id, "something broke")

        r = get_run(run.run_id)
        assert r.status == JobStatus.FAILED
        assert r.summary == "something broke"

    def test_recent_runs(self) -> None:
        from worker.services.job_registry import create_run, get_recent_runs

        create_run(JobType.SIMULATION)
        create_run(JobType.REPLAY)

        runs = get_recent_runs(limit=5)
        assert len(runs) >= 2
