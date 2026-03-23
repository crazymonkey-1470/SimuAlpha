"""Tests for symbol drilldown, compare, and watchlist intelligence endpoints."""

from fastapi.testclient import TestClient

from tests.conftest import register_and_login


# ── Symbol Overview ────────────────────────────────────────────────────────


def test_symbol_overview(client: TestClient) -> None:
    resp = client.get("/api/v1/symbols/SPY/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "SPY"
    assert "regime" in data
    assert "signal" in data
    assert "actors" in data
    assert "scenarios" in data
    assert "fragility" in data
    assert "warning_count" in data


def test_symbol_overview_unknown_symbol(client: TestClient) -> None:
    resp = client.get("/api/v1/symbols/ZZZZZ/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "ZZZZZ"
    assert data["regime"] is None


def test_symbol_regime(client: TestClient) -> None:
    resp = client.get("/api/v1/symbols/SPY/regime")
    assert resp.status_code == 200
    data = resp.json()
    assert "regime" in data
    assert "confidence" in data


def test_symbol_actors(client: TestClient) -> None:
    resp = client.get("/api/v1/symbols/SPY/actors")
    assert resp.status_code == 200
    data = resp.json()
    assert "actors" in data
    assert "actor_count" in data


def test_symbol_scenarios(client: TestClient) -> None:
    resp = client.get("/api/v1/symbols/SPY/scenarios")
    assert resp.status_code == 200
    data = resp.json()
    assert "scenarios" in data


def test_symbol_signals(client: TestClient) -> None:
    resp = client.get("/api/v1/symbols/SPY/signals")
    assert resp.status_code == 200
    data = resp.json()
    assert "bias" in data
    assert "confidence" in data


def test_symbol_history(client: TestClient) -> None:
    resp = client.get("/api/v1/symbols/SPY/history?limit=10")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "SPY"
    assert "entries" in data
    assert "total" in data


def test_symbol_replay(client: TestClient) -> None:
    resp = client.get("/api/v1/symbols/SPY/replay")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "SPY"
    assert "frames" in data


def test_symbol_runs(client: TestClient) -> None:
    resp = client.get("/api/v1/symbols/SPY/runs")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "SPY"
    assert "runs" in data


# ── Compare ────────────────────────────────────────────────────────────────


def test_compare_symbols(client: TestClient) -> None:
    resp = client.get("/api/v1/symbols/compare?symbols=SPY,QQQ,TLT")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["symbols"]) == 3
    for entry in data["symbols"]:
        assert "fragility" in entry
        assert "warning_count" in entry


def test_compare_single_symbol(client: TestClient) -> None:
    resp = client.get("/api/v1/symbols/compare?symbols=NVDA")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["symbols"]) == 1


# ── Watchlist Intelligence ─────────────────────────────────────────────────


def test_watchlist_intelligence_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/v1/watchlists/00000000-0000-0000-0000-000000000000/intelligence")
    assert resp.status_code == 401


def test_watchlist_intelligence(client: TestClient) -> None:
    headers = register_and_login(client, "sym_test@example.com")

    # Create a watchlist with symbols
    resp = client.post("/api/v1/watchlists", json={"name": "Intel Test"}, headers=headers)
    assert resp.status_code == 201
    wl_id = resp.json()["id"]

    client.post(f"/api/v1/watchlists/{wl_id}/items", json={"symbol": "SPY"}, headers=headers)
    client.post(f"/api/v1/watchlists/{wl_id}/items", json={"symbol": "QQQ"}, headers=headers)

    resp = client.get(f"/api/v1/watchlists/{wl_id}/intelligence", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["watchlist_id"] == wl_id
    assert data["watchlist_name"] == "Intel Test"
    assert len(data["symbols"]) == 2
    assert "regime_distribution" in data
    assert "signal_distribution" in data
    assert "highest_fragility" in data
    assert "strongest_conviction" in data
    assert "total_warnings" in data


# ── Saved Views with Research Context ──────────────────────────────────────


def test_saved_view_research_context(client: TestClient) -> None:
    headers = register_and_login(client, "views_research@example.com")

    resp = client.post("/api/v1/views", json={
        "name": "SPY High Vol Research",
        "view_type": "research",
        "config": {
            "symbols": ["SPY"],
            "date_range": {"start": "2025-01-01", "end": "2025-03-01"},
            "page_context": "symbol",
            "filters": {"regime": "unstable_rally"},
        },
        "is_default": False,
    }, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["view_type"] == "research"
    assert data["config"]["symbols"] == ["SPY"]

    resp = client.get("/api/v1/views", headers=headers)
    assert resp.status_code == 200
    views = resp.json()["views"]
    research_views = [v for v in views if v["view_type"] == "research"]
    assert len(research_views) >= 1
