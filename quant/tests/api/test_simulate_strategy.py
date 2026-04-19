"""HTTP integration for POST /v1/tools/simulate-strategy."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient

from simualpha_quant.api import auth as auth_mod
from simualpha_quant.research import jobs as jobs_mod
from simualpha_quant.schemas import (
    EquityOHLC,
    HorizonOutcome,
    SimulateStrategyResponse,
    SimulationSummary,
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

    from simualpha_quant.research import universes as u

    async def _noop(name="tracked_8500"):
        return 0

    monkeypatch.setattr(u, "refresh", _noop)
    monkeypatch.setattr(u, "start_refresher", lambda: None)
    monkeypatch.setattr(u, "stop_refresher", lambda: None)

    stub_resp = SimulateStrategyResponse(
        summary_stats=SimulationSummary(
            total_trades=2, win_rate=1.0, avg_win_pct=0.2, avg_loss_pct=0.0,
            profit_factor=10.0, sharpe=1.5, sortino=2.0, max_drawdown_pct=-0.05, calmar=1.0,
        ),
        per_horizon_outcomes=[HorizonOutcome(horizon_months=3, reached_target_pct=1.0)],
        equity_curve=[100_000.0, 120_000.0],
        equity_curve_dates=[date(2020, 1, 1), date(2020, 12, 31)],
        equity_curve_ohlc=[
            EquityOHLC(date=date(2020, 1, 1), open=100_000.0, high=100_000.0, low=100_000.0, close=100_000.0),
            EquityOHLC(date=date(2020, 12, 31), open=120_000.0, high=120_000.0, low=120_000.0, close=120_000.0),
        ],
        trade_log_sample=[],
        cached=False,
        hash="x" * 32,
        computed_at=datetime.now(tz=timezone.utc),
    )

    spec = registry.by_name("simulate_strategy")
    original = spec.handler
    object.__setattr__(spec, "handler", lambda req: stub_resp)  # type: ignore[misc]

    from simualpha_quant.api import app as app_mod

    monkeypatch.setattr(app_mod, "simulate_strategy", lambda req: stub_resp)

    from simualpha_quant.api.app import create_app

    try:
        yield TestClient(create_app())
    finally:
        object.__setattr__(spec, "handler", original)  # type: ignore[misc]


def _body(chart_samples: int = 3) -> dict:
    return {
        "strategy": {
            "entry": {"pattern_name": "wave_2_at_618"},
            "exit": {
                "take_profit": [
                    {"pct_of_position": 0.5, "price_rule": {"type": "at_fib", "level": 1.618}},
                ],
                "stop_loss": {"price_rule": {"type": "at_fib", "level": 0.786}},
            },
            "position_sizing": {"method": "fixed", "params": {"stake_usd": 10000}},
            "universe_spec": {"tickers": ["HIMS", "NKE"]},
            "date_range": {"start": "2020-01-01", "end": "2022-12-31"},
        },
        "chart_samples": chart_samples,
    }


def test_sync_path_returns_200(client):
    r = client.post(
        "/v1/tools/simulate-strategy",
        json=_body(3),
        headers={"Authorization": "Bearer test-bootstrap"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["summary_stats"]["total_trades"] == 2
    assert len(body["data"]["equity_curve"]) == len(body["data"]["equity_curve_ohlc"])


def test_force_async_returns_202_with_job_id(client):
    r = client.post(
        "/v1/tools/simulate-strategy?async=true",
        json=_body(3),
        headers={"Authorization": "Bearer test-bootstrap"},
    )
    assert r.status_code == 202
    body = r.json()
    assert "job_id" in body["data"]
    assert body["data"]["status"] == "queued"


def test_invalid_body_is_422(client):
    r = client.post(
        "/v1/tools/simulate-strategy",
        json={"strategy": {}},
        headers={"Authorization": "Bearer test-bootstrap"},
    )
    assert r.status_code == 422


def test_listed_in_v1_tools(client):
    r = client.get("/v1/tools", headers={"Authorization": "Bearer test-bootstrap"})
    assert r.status_code == 200
    names = {t["name"] for t in r.json()["tools"]}
    assert "simulate_strategy" in names
