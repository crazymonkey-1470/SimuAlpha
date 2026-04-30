"""Gating tests for ``simulate_strategy``.

simulate_strategy is registered in ``tools/registry.py`` but marked
``status="unavailable"`` pending Stage 4 freqtrade compatibility fixes.
These tests pin that contract so a future change can't silently un-gate
it without also dropping these assertions.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from simualpha_quant.api import auth as auth_mod
from simualpha_quant.tools.registry import (
    SIMULATE_STRATEGY_UNAVAILABLE_REASON,
    by_name,
)


@pytest.fixture()
def client(monkeypatch):
    auth_mod.reset_rate_state()
    monkeypatch.setenv("QUANT_SERVICE_BOOTSTRAP_TOKEN", "test-bootstrap")
    monkeypatch.setattr(auth_mod, "_touch_last_used", lambda *a, **kw: None)

    def fake_lookup(token: str):
        if token == "valid-key":
            return auth_mod.AuthedKey(
                id="test-key",
                name="test",
                scopes=(auth_mod.REQUIRED_SCOPE,),
                rate_limit_per_minute=1000,
            )
        raise auth_mod.AuthError(401, "Invalid API key")

    monkeypatch.setattr(auth_mod, "_lookup_supabase", fake_lookup)

    from simualpha_quant.api.app import create_app

    return TestClient(create_app())


# ─────────────────── registry-level gate ────────────────────


def test_registry_marks_simulate_strategy_unavailable():
    spec = by_name("simulate_strategy")
    assert spec.status == "unavailable"
    assert spec.unavailable_reason == SIMULATE_STRATEGY_UNAVAILABLE_REASON


def test_other_tools_still_available():
    for name in (
        "get_price_history",
        "get_fundamentals",
        "render_tli_chart",
        "backtest_pattern",
    ):
        assert by_name(name).status == "available", f"{name} unexpectedly gated"


# ─────────────────── HTTP-layer gate ────────────────────


def test_simulate_strategy_route_returns_503(client):
    r = client.post(
        "/v1/tools/simulate-strategy",
        json={
            "strategy": {
                "entry": {"pattern_name": "wave_2_at_618"},
                "exit": {
                    "take_profit": [],
                    "stop_loss": {
                        "price_rule": {"type": "at_fib", "level": 0.786},
                        "type": "hard",
                    },
                    "time_stop_days": 540,
                },
                "position_sizing": {"method": "fixed", "params": {"stake_usd": 10000}},
                "universe_spec": {"tickers": ["HIMS"]},
                "date_range": {"start": "2020-01-01", "end": "2020-12-31"},
                "initial_capital": 100000.0,
                "max_open_positions": 5,
            },
            "chart_samples": 0,
        },
        headers={"Authorization": "Bearer valid-key"},
    )
    assert r.status_code == 503
    body = r.json()
    assert body["status"] == "error"
    assert body["error_type"] == "tool_unavailable"
    assert body["tool"] == "simulate_strategy"
    assert body["error_detail"] == SIMULATE_STRATEGY_UNAVAILABLE_REASON


def test_simulate_strategy_503_still_requires_auth(client):
    # Gating MUST sit behind auth — anonymous probes shouldn't learn
    # tool-availability state without a valid key.
    r = client.post("/v1/tools/simulate-strategy", json={})
    assert r.status_code == 401


def test_simulate_strategy_503_with_empty_body(client):
    # The 503 short-circuits BEFORE body parsing, so a malformed /
    # empty body still yields the gate response, not a 400/422.
    r = client.post(
        "/v1/tools/simulate-strategy",
        json={},
        headers={"Authorization": "Bearer valid-key"},
    )
    assert r.status_code == 503
    assert r.json()["error_type"] == "tool_unavailable"


# ─────────────────── /health discovery surface ────────────────────


def test_health_lists_simulate_strategy_in_unavailable(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert "simulate_strategy" in body["tools_unavailable"]
    assert (
        body["tools_unavailable"]["simulate_strategy"]
        == SIMULATE_STRATEGY_UNAVAILABLE_REASON
    )
    assert "simulate_strategy" not in body["tools_available"]
    # The four working tools still present in available.
    assert set(body["tools_available"]) == {
        "get_price_history",
        "get_fundamentals",
        "render_tli_chart",
        "backtest_pattern",
    }
    # Legacy `tools` field still lists everything (back-compat).
    assert "simulate_strategy" in body["tools"]


# ─────────────────── /v1/tools enumeration ────────────────────


def test_v1_tools_marks_simulate_strategy_unavailable(client):
    r = client.get("/v1/tools", headers={"Authorization": "Bearer valid-key"})
    assert r.status_code == 200
    tools = {t["name"]: t for t in r.json()["tools"]}

    sim = tools["simulate_strategy"]
    assert sim["status"] == "unavailable"
    assert sim["unavailable_reason"] == SIMULATE_STRATEGY_UNAVAILABLE_REASON

    for name in ("get_price_history", "get_fundamentals", "render_tli_chart", "backtest_pattern"):
        assert tools[name]["status"] == "available"
        assert tools[name]["unavailable_reason"] is None
