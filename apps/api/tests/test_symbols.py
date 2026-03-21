"""Tests for symbol drilldown, compare, and watchlist intelligence endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def auth_headers(client: AsyncClient) -> dict:
    resp = await client.post("/api/v1/auth/register", json={
        "email": "sym_test@example.com",
        "password": "securepass123",
        "full_name": "Symbol Tester",
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── Symbol Overview ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_symbol_overview(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/symbols/SPY/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "SPY"
    assert "regime" in data
    assert "signal" in data
    assert "actors" in data
    assert "scenarios" in data
    assert "fragility" in data
    assert "warning_count" in data


@pytest.mark.asyncio
async def test_symbol_overview_unknown_symbol(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/symbols/ZZZZZ/overview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "ZZZZZ"
    assert data["regime"] is None


@pytest.mark.asyncio
async def test_symbol_regime(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/symbols/SPY/regime")
    assert resp.status_code == 200
    data = resp.json()
    assert "regime" in data
    assert "confidence" in data


@pytest.mark.asyncio
async def test_symbol_actors(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/symbols/SPY/actors")
    assert resp.status_code == 200
    data = resp.json()
    assert "actors" in data
    assert "actor_count" in data


@pytest.mark.asyncio
async def test_symbol_scenarios(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/symbols/SPY/scenarios")
    assert resp.status_code == 200
    data = resp.json()
    assert "scenarios" in data


@pytest.mark.asyncio
async def test_symbol_signals(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/symbols/SPY/signals")
    assert resp.status_code == 200
    data = resp.json()
    assert "bias" in data
    assert "confidence" in data


@pytest.mark.asyncio
async def test_symbol_history(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/symbols/SPY/history?limit=10")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "SPY"
    assert "entries" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_symbol_replay(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/symbols/SPY/replay")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "SPY"
    assert "frames" in data


@pytest.mark.asyncio
async def test_symbol_runs(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/symbols/SPY/runs")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "SPY"
    assert "runs" in data


# ── Compare ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_compare_symbols(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/symbols/compare?symbols=SPY,QQQ,TLT")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["symbols"]) == 3
    assert data["symbols"][0]["symbol"] == "SPY"
    assert data["symbols"][1]["symbol"] == "QQQ"
    assert data["symbols"][2]["symbol"] == "TLT"
    for entry in data["symbols"]:
        assert "fragility" in entry
        assert "warning_count" in entry


@pytest.mark.asyncio
async def test_compare_single_symbol(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/symbols/compare?symbols=NVDA")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["symbols"]) == 1


# ── Watchlist Intelligence ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_watchlist_intelligence_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/watchlists/00000000-0000-0000-0000-000000000000/intelligence")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_watchlist_intelligence(client: AsyncClient, auth_headers: dict) -> None:
    # Create a watchlist with symbols
    resp = await client.post("/api/v1/watchlists", json={"name": "Intel Test"}, headers=auth_headers)
    assert resp.status_code == 201
    wl_id = resp.json()["id"]

    await client.post(f"/api/v1/watchlists/{wl_id}/items", json={"symbol": "SPY"}, headers=auth_headers)
    await client.post(f"/api/v1/watchlists/{wl_id}/items", json={"symbol": "QQQ"}, headers=auth_headers)

    # Get intelligence
    resp = await client.get(f"/api/v1/watchlists/{wl_id}/intelligence", headers=auth_headers)
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


@pytest.mark.asyncio
async def test_saved_view_research_context(client: AsyncClient, auth_headers: dict) -> None:
    resp = await client.post("/api/v1/views", json={
        "name": "SPY High Vol Research",
        "view_type": "research",
        "config": {
            "symbols": ["SPY"],
            "date_range": {"start": "2025-01-01", "end": "2025-03-01"},
            "page_context": "symbol",
            "filters": {"regime": "unstable_rally"},
        },
        "is_default": False,
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["view_type"] == "research"
    assert data["config"]["symbols"] == ["SPY"]

    # Verify it appears in list
    resp = await client.get("/api/v1/views", headers=auth_headers)
    assert resp.status_code == 200
    views = resp.json()["views"]
    research_views = [v for v in views if v["view_type"] == "research"]
    assert len(research_views) >= 1
