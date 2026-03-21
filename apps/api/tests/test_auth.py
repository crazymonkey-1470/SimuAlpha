"""Tests for auth endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "securepass123",
        "full_name": "Test User",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "test@example.com"
    assert data["user"]["full_name"] == "Test User"
    assert data["user"]["default_workspace_id"] is not None


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient) -> None:
    await client.post("/api/v1/auth/register", json={
        "email": "dupe@example.com",
        "password": "securepass123",
        "full_name": "Test User",
    })
    resp = await client.post("/api/v1/auth/register", json={
        "email": "dupe@example.com",
        "password": "securepass123",
        "full_name": "Test User 2",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_short_password(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register", json={
        "email": "short@example.com",
        "password": "short",
        "full_name": "Test User",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient) -> None:
    await client.post("/api/v1/auth/register", json={
        "email": "login@example.com",
        "password": "securepass123",
        "full_name": "Login User",
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": "login@example.com",
        "password": "securepass123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == "login@example.com"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient) -> None:
    await client.post("/api/v1/auth/register", json={
        "email": "wrong@example.com",
        "password": "securepass123",
        "full_name": "User",
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": "wrong@example.com",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient) -> None:
    reg = await client.post("/api/v1/auth/register", json={
        "email": "me@example.com",
        "password": "securepass123",
        "full_name": "Me User",
    })
    token = reg.json()["access_token"]
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "me@example.com"


@pytest.mark.asyncio
async def test_me_unauthenticated(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient) -> None:
    reg = await client.post("/api/v1/auth/register", json={
        "email": "refresh@example.com",
        "password": "securepass123",
        "full_name": "Refresh User",
    })
    refresh_token = reg.json()["refresh_token"]
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_logout(client: AsyncClient) -> None:
    reg = await client.post("/api/v1/auth/register", json={
        "email": "logout@example.com",
        "password": "securepass123",
        "full_name": "Logout User",
    })
    refresh_token = reg.json()["refresh_token"]
    resp = await client.post("/api/v1/auth/logout", json={"refresh_token": refresh_token})
    assert resp.status_code == 200

    # Refresh should fail after logout
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_watchlist_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/watchlists")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_watchlist_crud(client: AsyncClient) -> None:
    reg = await client.post("/api/v1/auth/register", json={
        "email": "wl@example.com",
        "password": "securepass123",
        "full_name": "WL User",
    })
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create
    resp = await client.post("/api/v1/watchlists", json={"name": "Tech Stocks"}, headers=headers)
    assert resp.status_code == 201
    wl_id = resp.json()["id"]

    # List
    resp = await client.get("/api/v1/watchlists", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1

    # Add item
    resp = await client.post(f"/api/v1/watchlists/{wl_id}/items", json={"symbol": "AAPL"}, headers=headers)
    assert resp.status_code == 201

    # Get
    resp = await client.get(f"/api/v1/watchlists/{wl_id}", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 1

    # Delete
    resp = await client.delete(f"/api/v1/watchlists/{wl_id}", headers=headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_preferences_crud(client: AsyncClient) -> None:
    reg = await client.post("/api/v1/auth/register", json={
        "email": "prefs@example.com",
        "password": "securepass123",
        "full_name": "Prefs User",
    })
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.get("/api/v1/me/preferences", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["default_symbol"] == "SPY"

    resp = await client.patch("/api/v1/me/preferences", json={"default_symbol": "QQQ"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["default_symbol"] == "QQQ"


@pytest.mark.asyncio
async def test_saved_views_crud(client: AsyncClient) -> None:
    reg = await client.post("/api/v1/auth/register", json={
        "email": "views@example.com",
        "password": "securepass123",
        "full_name": "Views User",
    })
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/api/v1/views", json={"name": "My Dashboard", "view_type": "dashboard", "config": {"symbols": ["SPY"]}}, headers=headers)
    assert resp.status_code == 201
    view_id = resp.json()["id"]

    resp = await client.get("/api/v1/views", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1

    resp = await client.delete(f"/api/v1/views/{view_id}", headers=headers)
    assert resp.status_code == 204
