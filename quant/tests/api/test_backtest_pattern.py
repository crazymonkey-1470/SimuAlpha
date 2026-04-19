"""HTTP integration for POST /v1/tools/backtest-pattern + GET /v1/jobs/{id}."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient

from simualpha_quant.api import auth as auth_mod
from simualpha_quant.research import jobs as jobs_mod
from simualpha_quant.schemas.backtest import (
    BacktestPatternResponse,
    HorizonStats,
)
from simualpha_quant.tools import registry


@pytest.fixture()
def client(monkeypatch):
    auth_mod.reset_rate_state()
    jobs_mod.reset_for_tests()
    monkeypatch.setenv("QUANT_SERVICE_BOOTSTRAP_TOKEN", "test-bootstrap")
    monkeypatch.setattr(
        auth_mod,
        "_lookup_supabase",
        lambda tok: (_ for _ in ()).throw(auth_mod.AuthError(401, "Invalid API key")),
    )
    monkeypatch.setattr(auth_mod, "_touch_last_used", lambda *a, **kw: None)

    # Stub the universe refresher (no Supabase dependency during tests).
    from simualpha_quant.research import universes as u

    monkeypatch.setattr(u, "refresh", lambda name="tracked_8500": _noop())
    monkeypatch.setattr(u, "start_refresher", lambda: None)
    monkeypatch.setattr(u, "stop_refresher", lambda: None)

    stub_resp = BacktestPatternResponse(
        pattern_name="wave_2_at_618",
        universe_resolved=2,
        signal_count=2,
        stats=[
            HorizonStats(
                horizon_months=h,
                sample_size=2,
                hit_rate=1.0,
                median_return=0.1,
                p25_return=0.08,
                p75_return=0.12,
                avg_max_drawdown=-0.05,
            )
            for h in (3, 6, 12, 24)
        ],
        per_year_breakdown=None,
        sample_signals=[],
        cached=False,
        hash="abc" * 10 + "ab",
        computed_at=datetime.now(tz=timezone.utc),
    )
    spec = registry.by_name("backtest_pattern")
    original = spec.handler
    object.__setattr__(spec, "handler", lambda req: stub_resp)  # type: ignore[misc]

    from simualpha_quant.api.app import create_app

    # Also stub the backtest_pattern import the app module captured at import time.
    from simualpha_quant.api import app as app_mod

    monkeypatch.setattr(app_mod, "backtest_pattern", lambda req: stub_resp)

    try:
        yield TestClient(create_app())
    finally:
        object.__setattr__(spec, "handler", original)  # type: ignore[misc]


async def _noop():
    return 0


def _body() -> dict:
    return {
        "pattern_name": "wave_2_at_618",
        "universe_spec": {"tickers": ["HIMS", "NKE"]},
        "date_range": {"start": "2020-01-01", "end": "2022-01-01"},
    }


def test_sync_path_returns_200(client):
    r = client.post(
        "/v1/tools/backtest-pattern",
        json=_body(),
        headers={"Authorization": "Bearer test-bootstrap"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["pattern_name"] == "wave_2_at_618"
    assert len(body["data"]["stats"]) == 4


def test_force_async_returns_202_with_job_id(client):
    r = client.post(
        "/v1/tools/backtest-pattern?async=true",
        json=_body(),
        headers={"Authorization": "Bearer test-bootstrap"},
    )
    assert r.status_code == 202
    body = r.json()
    assert body["success"] is True
    assert "job_id" in body["data"]
    assert body["data"]["status"] == "queued"


def test_jobs_endpoint_unknown_id_returns_404(client):
    r = client.get(
        "/v1/jobs/does-not-exist",
        headers={"Authorization": "Bearer test-bootstrap"},
    )
    assert r.status_code == 404


def test_admin_reload_universe_requires_auth(client):
    r = client.post("/admin/reload-universe")
    assert r.status_code == 401

    r2 = client.post(
        "/admin/reload-universe",
        headers={"Authorization": "Bearer test-bootstrap"},
    )
    assert r2.status_code == 200
    assert r2.json()["data"]["universe"] == "tracked_8500"


def test_invalid_body_is_422(client):
    r = client.post(
        "/v1/tools/backtest-pattern",
        json={"pattern_name": "wave_2_at_618"},  # missing universe_spec, date_range
        headers={"Authorization": "Bearer test-bootstrap"},
    )
    assert r.status_code == 422
