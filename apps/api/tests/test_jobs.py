"""Tests for job queue API endpoints."""

from fastapi.testclient import TestClient


def test_list_jobs_empty(client: TestClient) -> None:
    resp = client.get("/api/v1/jobs")
    assert resp.status_code == 200
    data = resp.json()
    assert "jobs" in data
    assert "total" in data
    assert isinstance(data["jobs"], list)


def test_get_job_not_found(client: TestClient) -> None:
    resp = client.get("/api/v1/jobs/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_get_job_invalid_id(client: TestClient) -> None:
    resp = client.get("/api/v1/jobs/not-a-uuid")
    assert resp.status_code == 400


def test_list_jobs_with_filter(client: TestClient) -> None:
    resp = client.get("/api/v1/jobs?status=completed&limit=5")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["jobs"], list)


def test_system_queue_status(client: TestClient) -> None:
    resp = client.get("/api/v1/system/queue")
    assert resp.status_code == 200
    data = resp.json()
    assert "redis_connected" in data
    assert "queues" in data
    assert "total_pending" in data


def test_system_worker_health(client: TestClient) -> None:
    resp = client.get("/api/v1/system/worker-health")
    assert resp.status_code == 200
    data = resp.json()
    assert "redis_connected" in data
    assert "workers" in data
    assert "worker_count" in data


def test_system_schedules(client: TestClient) -> None:
    resp = client.get("/api/v1/system/schedules")
    assert resp.status_code == 200
    data = resp.json()
    assert "schedules" in data
    assert "scheduler_running" in data
    assert isinstance(data["schedules"], list)


def test_system_status(client: TestClient) -> None:
    resp = client.get("/api/v1/system/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "api_status" in data
    assert "worker_status" in data
