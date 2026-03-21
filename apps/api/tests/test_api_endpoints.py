"""Tests for API endpoint responses."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.session import get_db
from app.main import app


@pytest.fixture
def client():
    """Create test client with in-memory SQLite."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_health(client: TestClient) -> None:
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"


def test_system_status(client: TestClient) -> None:
    resp = client.get("/api/v1/system/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "api_status" in data


def test_runs_list_empty(client: TestClient) -> None:
    resp = client.get("/api/v1/runs")
    assert resp.status_code == 200
    data = resp.json()
    assert data["runs"] == []
    assert data["total"] == 0


def test_replays_list_empty(client: TestClient) -> None:
    resp = client.get("/api/v1/replays")
    assert resp.status_code == 200
    data = resp.json()
    assert data["runs"] == []


def test_calibrations_list_empty(client: TestClient) -> None:
    resp = client.get("/api/v1/calibrations")
    assert resp.status_code == 200
    data = resp.json()
    assert data["runs"] == []


def test_regime_current_fallback(client: TestClient) -> None:
    """When no DB data exists, should fall back to engine/seed data."""
    resp = client.get("/api/v1/regime/current")
    assert resp.status_code == 200
    data = resp.json()
    assert "regime" in data
    assert "confidence" in data


def test_actors_current_fallback(client: TestClient) -> None:
    resp = client.get("/api/v1/actors/current")
    assert resp.status_code == 200
    data = resp.json()
    assert "actors" in data
    assert "actor_count" in data


def test_scenarios_current_fallback(client: TestClient) -> None:
    resp = client.get("/api/v1/scenarios/current")
    assert resp.status_code == 200
    data = resp.json()
    assert "scenarios" in data


def test_signals_current_fallback(client: TestClient) -> None:
    resp = client.get("/api/v1/signals/current")
    assert resp.status_code == 200
    data = resp.json()
    assert "bias" in data


def test_run_not_found(client: TestClient) -> None:
    resp = client.get("/api/v1/runs/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
