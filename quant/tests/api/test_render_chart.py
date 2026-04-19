"""HTTP integration for POST /v1/tools/render-tli-chart."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from simualpha_quant.api import auth as auth_mod
from simualpha_quant.schemas.charts import RenderChartResponse
from simualpha_quant.tools import registry


@pytest.fixture()
def client(monkeypatch):
    auth_mod.reset_rate_state()
    monkeypatch.setenv("QUANT_SERVICE_BOOTSTRAP_TOKEN", "test-bootstrap")
    monkeypatch.setattr(
        auth_mod,
        "_lookup_supabase",
        lambda tok: (_ for _ in ()).throw(auth_mod.AuthError(401, "Invalid API key")),
    )
    monkeypatch.setattr(auth_mod, "_touch_last_used", lambda *a, **kw: None)

    from simualpha_quant.api.app import create_app

    stub = RenderChartResponse(
        url="https://cdn.example/charts/HIMS/daily/abc.png",
        cached=False,
        hash="abc",
        width=1200,
        height=700,
        generated_at=datetime.now(tz=timezone.utc),
    )
    spec = registry.by_name("render_tli_chart")
    original = spec.handler
    object.__setattr__(spec, "handler", lambda req: stub)  # type: ignore[misc]
    try:
        yield TestClient(create_app())
    finally:
        object.__setattr__(spec, "handler", original)  # type: ignore[misc]


def _body() -> dict:
    return {
        "ticker": "HIMS",
        "timeframe": "daily",
        "date_range": {"start": "2024-01-01", "end": "2024-06-30"},
    }


def test_missing_auth_rejected(client):
    r = client.post("/v1/tools/render-tli-chart", json=_body())
    assert r.status_code == 401


def test_bootstrap_token_returns_url(client):
    r = client.post(
        "/v1/tools/render-tli-chart",
        json=_body(),
        headers={"Authorization": "Bearer test-bootstrap"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["url"].endswith(".png")
    assert body["data"]["hash"] == "abc"
    assert body["meta"]["tool"] == "render_tli_chart"


def test_invalid_timeframe_rejected(client):
    payload = _body() | {"timeframe": "yearly"}
    r = client.post(
        "/v1/tools/render-tli-chart",
        json=payload,
        headers={"Authorization": "Bearer test-bootstrap"},
    )
    assert r.status_code == 422
    assert r.json()["success"] is False


def test_listed_in_v1_tools(client):
    r = client.get("/v1/tools", headers={"Authorization": "Bearer test-bootstrap"})
    assert r.status_code == 200
    names = {t["name"] for t in r.json()["tools"]}
    assert "render_tli_chart" in names
