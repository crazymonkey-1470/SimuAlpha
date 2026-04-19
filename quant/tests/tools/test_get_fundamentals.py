"""Unit tests for the cache-first fundamentals tool."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import pytest

import importlib

from simualpha_quant.schemas.fundamentals import FundamentalsRequest

mod = importlib.import_module("simualpha_quant.tools.get_fundamentals")


@dataclass
class FakeFundRow:
    ticker: str
    period_end: str
    metric_name: str
    metric_value: float

    def as_dict(self) -> dict:
        return {
            "ticker": self.ticker,
            "period_end": self.period_end,
            "metric_name": self.metric_name,
            "metric_value": self.metric_value,
            "source": "openbb",
        }


def _cache_row(period_end: date, metric: str, value: float) -> dict:
    return {
        "period_end": period_end.isoformat(),
        "metric_name": metric,
        "metric_value": value,
        "source": "openbb",
        "ingested_at": datetime(2025, 1, 1, tzinfo=timezone.utc).isoformat(),
    }


@pytest.fixture(autouse=True)
def _patch(monkeypatch):
    state = {"fetch_called": False, "upsert_called": False, "read_calls": 0}
    cache: dict[str, list[dict]] = {"rows": []}

    def fake_read(ticker, metrics):  # noqa: ARG001
        state["read_calls"] += 1
        return [r for r in cache["rows"] if r["metric_name"] in metrics]

    def fake_fetch(ticker):
        state["fetch_called"] = True
        return [
            FakeFundRow(ticker, date.today().isoformat(), "revenue", 1e9),
            FakeFundRow(ticker, date.today().isoformat(), "ebitda", 2e8),
        ]

    def fake_upsert(table, rows, on_conflict):  # noqa: ARG001
        state["upsert_called"] = True
        for r in rows:
            cache["rows"].append(
                _cache_row(date.fromisoformat(r["period_end"]), r["metric_name"], r["metric_value"])
            )

    monkeypatch.setattr(mod, "_read_cache", fake_read)
    monkeypatch.setattr(mod, "fetch_fundamentals_one", fake_fetch)
    monkeypatch.setattr(mod, "batch_upsert", fake_upsert)
    return state, cache


def test_fresh_cache_returns_without_fetch(_patch):
    state, cache = _patch
    recent = date.today() - timedelta(days=30)
    cache["rows"] = [
        _cache_row(recent, "revenue", 1e9),
        _cache_row(recent, "ebitda", 2e8),
    ]

    result = mod.get_fundamentals(FundamentalsRequest(ticker="HIMS"))

    assert result.source == "cache"
    assert result.ticker == "HIMS"
    assert result.latest_period_end == recent
    assert state["fetch_called"] is False


def test_stale_cache_triggers_refresh(_patch):
    state, cache = _patch
    stale = date.today() - timedelta(days=200)  # > STALE_AFTER_DAYS
    cache["rows"] = [_cache_row(stale, "revenue", 1e9)]

    result = mod.get_fundamentals(FundamentalsRequest(ticker="HIMS"))

    assert state["fetch_called"] is True
    assert state["upsert_called"] is True
    assert result.source == "cache+backfill"


def test_full_miss_triggers_fetch(_patch):
    state, _ = _patch

    result = mod.get_fundamentals(FundamentalsRequest(ticker="NKE"))

    assert state["fetch_called"] is True
    assert result.source == "openbb"
    assert all(r.metric_name in {"revenue", "ebitda"} for r in result.records)


def test_metrics_filter_only_returns_requested(_patch):
    _, cache = _patch
    recent = date.today() - timedelta(days=30)
    cache["rows"] = [
        _cache_row(recent, "revenue", 1e9),
        _cache_row(recent, "ebitda", 2e8),
        _cache_row(recent, "net_income", 3e7),
    ]

    result = mod.get_fundamentals(
        FundamentalsRequest(ticker="HIMS", metrics=["revenue", "net_income"])
    )

    returned_names = {r.metric_name for r in result.records}
    assert returned_names == {"revenue", "net_income"}


def test_rejects_unknown_metric():
    with pytest.raises(ValueError):
        FundamentalsRequest(ticker="HIMS", metrics=["totally_made_up"])
