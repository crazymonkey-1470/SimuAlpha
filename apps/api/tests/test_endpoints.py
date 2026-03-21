import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_regime_current(client: AsyncClient) -> None:
    response = await client.get("/api/v1/regime/current")
    assert response.status_code == 200
    data = response.json()
    assert "regime" in data
    assert "confidence" in data
    assert 0 <= data["confidence"] <= 1
    assert len(data["drivers"]) > 0


@pytest.mark.asyncio
async def test_regime_history(client: AsyncClient) -> None:
    response = await client.get("/api/v1/regime/history?limit=3")
    assert response.status_code == 200
    data = response.json()
    assert len(data["entries"]) <= 3


@pytest.mark.asyncio
async def test_actors_current(client: AsyncClient) -> None:
    response = await client.get("/api/v1/actors/current")
    assert response.status_code == 200
    data = response.json()
    assert data["actor_count"] > 0
    assert len(data["actors"]) == data["actor_count"]
    actor = data["actors"][0]
    assert "archetype" in actor
    assert "bias" in actor


@pytest.mark.asyncio
async def test_scenarios_current(client: AsyncClient) -> None:
    response = await client.get("/api/v1/scenarios/current")
    assert response.status_code == 200
    data = response.json()
    assert "base_case_id" in data
    assert len(data["scenarios"]) > 0
    probabilities = [s["probability"] for s in data["scenarios"]]
    assert abs(sum(probabilities) - 1.0) < 0.01


@pytest.mark.asyncio
async def test_signals_current(client: AsyncClient) -> None:
    response = await client.get("/api/v1/signals/current")
    assert response.status_code == 200
    data = response.json()
    assert "bias" in data
    assert "suggested_posture" in data


@pytest.mark.asyncio
async def test_cross_asset_context(client: AsyncClient) -> None:
    response = await client.get("/api/v1/context/cross-asset")
    assert response.status_code == 200
    data = response.json()
    assert len(data["entries"]) > 0
    instruments = [e["instrument"] for e in data["entries"]]
    assert "SPX" in instruments
    assert "VIX" in instruments


@pytest.mark.asyncio
async def test_replay_valid_date(client: AsyncClient) -> None:
    response = await client.get("/api/v1/replay/2025-03-18")
    assert response.status_code == 200
    data = response.json()
    assert data["date"] == "2025-03-18"
    assert "actor_states" in data
    assert data["realized_outcome"] is not None


@pytest.mark.asyncio
async def test_replay_missing_date(client: AsyncClient) -> None:
    response = await client.get("/api/v1/replay/2020-01-01")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_simulation_run(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/simulation/run",
        json={"horizon_days": 10, "num_paths": 500},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "queued"
    assert data["run_id"].startswith("sim-")
