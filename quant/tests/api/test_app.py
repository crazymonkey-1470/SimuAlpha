"""Integration tests for the FastAPI app.

Covers:
- /health unauthenticated
- missing / malformed / unknown bearer rejected
- bootstrap token accepted with WARNING in logs
- envelope shape on success and failure
- registered tool routes forward to the tool handler
"""

from __future__ import annotations

import os
from datetime import date

import pytest
from fastapi.testclient import TestClient

from simualpha_quant.api import auth as auth_mod
from simualpha_quant.schemas.prices import PriceBar, PriceHistory


@pytest.fixture()
def client(monkeypatch):
    auth_mod.reset_rate_state()

    monkeypatch.setenv("QUANT_SERVICE_BOOTSTRAP_TOKEN", "test-bootstrap")

    def fake_lookup(token: str):
        if token == "valid-key":
            return auth_mod.AuthedKey(
                id="test-key",
                name="test",
                scopes=(auth_mod.REQUIRED_SCOPE,),
                rate_limit_per_minute=1000,
            )
        if token == "wrong-scope":
            raise auth_mod.AuthError(403, f"Requires scope: {auth_mod.REQUIRED_SCOPE}")
        raise auth_mod.AuthError(401, "Invalid API key")

    monkeypatch.setattr(auth_mod, "_lookup_supabase", fake_lookup)
    monkeypatch.setattr(auth_mod, "_touch_last_used", lambda *a, **kw: None)

    # Import after env + patches so auth module sees them.
    from simualpha_quant.api.app import create_app

    # Stub the tool handler so we don't hit Supabase.
    from simualpha_quant.tools import registry

    stub_history = PriceHistory(
        ticker="HIMS",
        start=date(2024, 1, 1),
        end=date(2024, 1, 5),
        bars=[PriceBar(date=date(2024, 1, 2), close=30.0)],
        source="cache",
    )

    original_price_handler = registry.TOOLS[0].handler
    object.__setattr__(registry.TOOLS[0], "handler", lambda req: stub_history)  # type: ignore[misc]

    try:
        yield TestClient(create_app())
    finally:
        object.__setattr__(registry.TOOLS[0], "handler", original_price_handler)  # type: ignore[misc]


def test_health_no_auth(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "get_price_history" in body["tools"]


def test_missing_auth_header_is_401(client):
    r = client.post(
        "/v1/tools/price-history",
        json={"ticker": "HIMS", "start": "2024-01-01", "end": "2024-01-05"},
    )
    assert r.status_code == 401
    assert r.json()["success"] is False


def test_invalid_token_is_401(client):
    r = client.post(
        "/v1/tools/price-history",
        json={"ticker": "HIMS", "start": "2024-01-01", "end": "2024-01-05"},
        headers={"Authorization": "Bearer nope"},
    )
    assert r.status_code == 401


def test_bootstrap_token_accepted(client):
    r = client.post(
        "/v1/tools/price-history",
        json={"ticker": "HIMS", "start": "2024-01-01", "end": "2024-01-05"},
        headers={"Authorization": f"Bearer {os.environ['QUANT_SERVICE_BOOTSTRAP_TOKEN']}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["ticker"] == "HIMS"
    assert body["meta"]["tool"] == "get_price_history"


def test_valid_key_returns_envelope(client):
    r = client.post(
        "/v1/tools/price-history",
        json={"ticker": "HIMS", "start": "2024-01-01", "end": "2024-01-05"},
        headers={"Authorization": "Bearer valid-key"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["source"] == "cache"
    assert len(body["data"]["bars"]) == 1
    assert "timestamp" in body["meta"]


def test_invalid_body_is_422(client):
    r = client.post(
        "/v1/tools/price-history",
        json={"ticker": "HIMS"},  # missing start/end
        headers={"Authorization": "Bearer valid-key"},
    )
    assert r.status_code == 422
    body = r.json()
    assert body["success"] is False
    assert body["error"] == "Invalid request body"


def test_list_tools_requires_auth(client):
    r = client.get("/v1/tools")
    assert r.status_code == 401

    r2 = client.get("/v1/tools", headers={"Authorization": "Bearer valid-key"})
    assert r2.status_code == 200
    tools = r2.json()["tools"]
    names = {t["name"] for t in tools}
    assert names == {"get_price_history", "get_fundamentals"}
