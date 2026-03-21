"""Tests for job execution and registry."""

from __future__ import annotations

from worker.jobs.calibration_job import execute as calibrate
from worker.jobs.replay_job import execute_single
from worker.jobs.simulation_job import execute as simulate
from worker.schemas.system import JobStatus
from worker.services.job_registry import get_run


class TestSimulationJob:
    def test_execute_returns_run_id(self):
        run_id = simulate(seed=42)
        assert run_id.startswith("run-")

    def test_run_tracked_as_completed(self):
        run_id = simulate(seed=42)
        run = get_run(run_id)
        assert run is not None
        assert run.status == JobStatus.COMPLETED
        assert run.summary is not None


class TestReplayJob:
    def test_execute_single(self):
        run_id = execute_single("2025-03-18", seed=42)
        run = get_run(run_id)
        assert run is not None
        assert run.status == JobStatus.COMPLETED


class TestCalibrationJob:
    def test_scaffold_completes(self):
        run_id = calibrate()
        run = get_run(run_id)
        assert run is not None
        assert run.status == JobStatus.COMPLETED
        assert len(run.warnings) > 0
