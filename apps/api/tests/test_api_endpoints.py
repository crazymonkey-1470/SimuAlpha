"""Tests for API endpoint responses — uses shared conftest fixtures."""

from fastapi.testclient import TestClient


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


def test_signals_history(client: TestClient) -> None:
    resp = client.get("/api/v1/signals/history")
    assert resp.status_code == 200
    data = resp.json()
    assert "entries" in data
    assert "period_start" in data


def test_regime_history(client: TestClient) -> None:
    resp = client.get("/api/v1/regime/history")
    assert resp.status_code == 200
    data = resp.json()
    assert "entries" in data


def test_run_not_found(client: TestClient) -> None:
    resp = client.get("/api/v1/runs/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


def test_replay_frame_fallback(client: TestClient) -> None:
    resp = client.get("/api/v1/replay/2025-03-18")
    assert resp.status_code == 200
    data = resp.json()
    assert "date" in data


def test_context_cross_asset(client: TestClient) -> None:
    resp = client.get("/api/v1/context/cross-asset")
    assert resp.status_code == 200
    data = resp.json()
    assert "entries" in data


def test_simulation_run(client: TestClient) -> None:
    resp = client.post("/api/v1/simulation/run", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert "run_id" in data
    assert data["status"] in ("completed", "queued", "failed")


def test_symbol_overview(client: TestClient) -> None:
    resp = client.get("/api/v1/symbols/SPY/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "SPY"


def test_symbol_compare(client: TestClient) -> None:
    resp = client.get("/api/v1/symbols/compare?symbols=SPY,QQQ")
    assert resp.status_code == 200
    data = resp.json()
    assert "symbols" in data
