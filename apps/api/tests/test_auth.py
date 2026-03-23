"""Tests for auth endpoints — uses shared conftest fixtures."""

from fastapi.testclient import TestClient

from tests.conftest import register_and_login


def test_register_success(client: TestClient) -> None:
    resp = client.post("/api/v1/auth/register", json={
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


def test_register_duplicate_email(client: TestClient) -> None:
    client.post("/api/v1/auth/register", json={
        "email": "dupe@example.com",
        "password": "securepass123",
        "full_name": "Test User",
    })
    resp = client.post("/api/v1/auth/register", json={
        "email": "dupe@example.com",
        "password": "securepass123",
        "full_name": "Test User 2",
    })
    assert resp.status_code == 422


def test_register_short_password(client: TestClient) -> None:
    resp = client.post("/api/v1/auth/register", json={
        "email": "short@example.com",
        "password": "short",
        "full_name": "Test User",
    })
    assert resp.status_code == 422


def test_login_success(client: TestClient) -> None:
    client.post("/api/v1/auth/register", json={
        "email": "login@example.com",
        "password": "securepass123",
        "full_name": "Login User",
    })
    resp = client.post("/api/v1/auth/login", json={
        "email": "login@example.com",
        "password": "securepass123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == "login@example.com"


def test_login_wrong_password(client: TestClient) -> None:
    client.post("/api/v1/auth/register", json={
        "email": "wrong@example.com",
        "password": "securepass123",
        "full_name": "User",
    })
    resp = client.post("/api/v1/auth/login", json={
        "email": "wrong@example.com",
        "password": "wrongpassword",
    })
    assert resp.status_code == 401


def test_me_authenticated(client: TestClient) -> None:
    headers = register_and_login(client, "me@example.com")
    resp = client.get("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "me@example.com"


def test_me_unauthenticated(client: TestClient) -> None:
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401


def test_refresh_token(client: TestClient) -> None:
    resp = client.post("/api/v1/auth/register", json={
        "email": "refresh@example.com",
        "password": "securepass123",
        "full_name": "Refresh User",
    })
    refresh_token = resp.json()["refresh_token"]
    resp = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_logout(client: TestClient) -> None:
    resp = client.post("/api/v1/auth/register", json={
        "email": "logout@example.com",
        "password": "securepass123",
        "full_name": "Logout User",
    })
    refresh_token = resp.json()["refresh_token"]
    resp = client.post("/api/v1/auth/logout", json={"refresh_token": refresh_token})
    assert resp.status_code == 200

    # Refresh should fail after logout
    resp = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 401


def test_watchlist_requires_auth(client: TestClient) -> None:
    resp = client.get("/api/v1/watchlists")
    assert resp.status_code == 401


def test_watchlist_crud(client: TestClient) -> None:
    headers = register_and_login(client, "wl@example.com")

    # Create
    resp = client.post("/api/v1/watchlists", json={"name": "Tech Stocks"}, headers=headers)
    assert resp.status_code == 201
    wl_id = resp.json()["id"]

    # List
    resp = client.get("/api/v1/watchlists", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1

    # Add item
    resp = client.post(f"/api/v1/watchlists/{wl_id}/items", json={"symbol": "AAPL"}, headers=headers)
    assert resp.status_code == 201

    # Get
    resp = client.get(f"/api/v1/watchlists/{wl_id}", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 1

    # Delete
    resp = client.delete(f"/api/v1/watchlists/{wl_id}", headers=headers)
    assert resp.status_code == 204


def test_preferences_crud(client: TestClient) -> None:
    headers = register_and_login(client, "prefs@example.com")

    resp = client.get("/api/v1/me/preferences", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["default_symbol"] == "SPY"

    resp = client.patch("/api/v1/me/preferences", json={"default_symbol": "QQQ"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["default_symbol"] == "QQQ"


def test_saved_views_crud(client: TestClient) -> None:
    headers = register_and_login(client, "views@example.com")

    resp = client.post(
        "/api/v1/views",
        json={"name": "My Dashboard", "view_type": "dashboard", "config": {"symbols": ["SPY"]}},
        headers=headers,
    )
    assert resp.status_code == 201
    view_id = resp.json()["id"]

    resp = client.get("/api/v1/views", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1

    resp = client.delete(f"/api/v1/views/{view_id}", headers=headers)
    assert resp.status_code == 204
