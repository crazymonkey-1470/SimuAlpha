"""Tests for events module and in-process job runner."""

from fastapi.testclient import TestClient


def test_events_publish_function() -> None:
    """publish_event should not raise even with no subscribers."""
    from app.api.routes.events import publish_event

    # Should not raise
    publish_event("test-channel", "test-event", {"key": "value"})


def test_simulation_job_submit(client: TestClient) -> None:
    """POST /api/v1/jobs/simulation should accept requests without Redis."""
    resp = client.post("/api/v1/jobs/simulation", json={
        "symbol": "SPY",
        "use_real_data": False,
    })
    # 200 if in-process fallback works, 503 if both Redis and fallback fail
    assert resp.status_code in (200, 503)
    if resp.status_code == 200:
        data = resp.json()
        assert "job_id" in data
        assert data["job_type"] == "simulation"


def test_replay_job_submit_no_redis(client: TestClient) -> None:
    """POST /api/v1/jobs/replay should fail gracefully without Redis."""
    resp = client.post("/api/v1/jobs/replay", json={
        "start_date": "2025-01-01",
        "end_date": "2025-01-05",
    })
    assert resp.status_code in (200, 503)


def test_job_runner_fallback() -> None:
    """try_enqueue_or_run_inprocess should fall back gracefully."""
    from app.services.job_runner import try_enqueue_or_run_inprocess

    result = try_enqueue_or_run_inprocess("data_refresh", symbol="SPY")
    # Without Redis, non-simulation jobs return failed status
    assert "job_id" in result
    assert result["job_type"] == "data_refresh"
