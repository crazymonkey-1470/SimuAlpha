"""Tests for job queue API endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_list_jobs_empty(client: AsyncClient) -> None:
    """GET /api/v1/jobs returns an empty list when no jobs exist."""
    resp = await client.get("/api/v1/jobs")
    assert resp.status_code == 200
    data = resp.json()
    assert "jobs" in data
    assert "total" in data
    assert isinstance(data["jobs"], list)


@pytest.mark.asyncio
async def test_get_job_not_found(client: AsyncClient) -> None:
    """GET /api/v1/jobs/{id} returns 404 for unknown ID."""
    resp = await client.get("/api/v1/jobs/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_job_invalid_id(client: AsyncClient) -> None:
    """GET /api/v1/jobs/{id} returns 400 for invalid UUID."""
    resp = await client.get("/api/v1/jobs/not-a-uuid")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_jobs_with_filter(client: AsyncClient) -> None:
    """GET /api/v1/jobs?status=completed returns filtered results."""
    resp = await client.get("/api/v1/jobs?status=completed&limit=5")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["jobs"], list)


@pytest.mark.asyncio
async def test_list_jobs_with_type_filter(client: AsyncClient) -> None:
    """GET /api/v1/jobs?job_type=simulation returns filtered results."""
    resp = await client.get("/api/v1/jobs?job_type=simulation")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["jobs"], list)


@pytest.mark.asyncio
async def test_system_queue_status(client: AsyncClient) -> None:
    """GET /api/v1/system/queue returns queue status."""
    resp = await client.get("/api/v1/system/queue")
    assert resp.status_code == 200
    data = resp.json()
    assert "redis_connected" in data
    assert "queues" in data
    assert "total_pending" in data


@pytest.mark.asyncio
async def test_system_worker_health(client: AsyncClient) -> None:
    """GET /api/v1/system/worker-health returns worker health."""
    resp = await client.get("/api/v1/system/worker-health")
    assert resp.status_code == 200
    data = resp.json()
    assert "redis_connected" in data
    assert "workers" in data
    assert "worker_count" in data


@pytest.mark.asyncio
async def test_system_schedules(client: AsyncClient) -> None:
    """GET /api/v1/system/schedules returns schedule definitions."""
    resp = await client.get("/api/v1/system/schedules")
    assert resp.status_code == 200
    data = resp.json()
    assert "schedules" in data
    assert "scheduler_running" in data
    assert isinstance(data["schedules"], list)
    # Should have at least the 4 default schedules
    assert len(data["schedules"]) >= 4


@pytest.mark.asyncio
async def test_system_status(client: AsyncClient) -> None:
    """GET /api/v1/system/status returns system status."""
    resp = await client.get("/api/v1/system/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "api_status" in data
    assert "worker_status" in data
