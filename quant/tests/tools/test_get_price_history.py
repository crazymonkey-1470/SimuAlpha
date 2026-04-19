"""Unit tests for the cache-first price history tool."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

import pytest

import importlib

from simualpha_quant.schemas.prices import PriceHistoryRequest

mod = importlib.import_module("simualpha_quant.tools.get_price_history")


@dataclass
class FakeRow:
    """Stand-in for data.openbb_ingest.PriceRow.as_dict()."""
    ticker: str
    date: str
    close: float

    def as_dict(self) -> dict:
        return {
            "ticker": self.ticker,
            "date": self.date,
            "open": self.close,
            "high": self.close,
            "low": self.close,
            "close": self.close,
            "adj_close": self.close,
            "volume": 1,
            "source": "openbb",
        }


def _cached_row(d: str, close: float = 10.0) -> dict:
    return {
        "date": d,
        "open": close,
        "high": close,
        "low": close,
        "close": close,
        "adj_close": close,
        "volume": 1,
        "ingested_at": datetime(2025, 1, 1, tzinfo=timezone.utc).isoformat(),
    }


@pytest.fixture(autouse=True)
def _patch(monkeypatch):
    state = {"fetch_called": False, "upsert_called": False, "reads": 0}
    cache: dict[str, list[dict]] = {"rows": []}

    def fake_read(ticker, start, end):  # noqa: ARG001
        state["reads"] += 1
        return list(cache["rows"])

    def fake_fetch(ticker, start, end):
        state["fetch_called"] = True
        state["last_fetch"] = (ticker, start, end)
        return [FakeRow(ticker, start, 99.0)]

    def fake_upsert(table, rows, on_conflict):  # noqa: ARG001
        state["upsert_called"] = True
        for row in rows:
            if row["date"] not in {r["date"] for r in cache["rows"]}:
                cache["rows"].append(_cached_row(row["date"], close=row.get("close") or 0.0))

    monkeypatch.setattr(mod, "_read_cache", fake_read)
    monkeypatch.setattr(mod, "fetch_prices_one", fake_fetch)
    monkeypatch.setattr(mod, "batch_upsert", fake_upsert)
    return state, cache


def test_cache_hit_returns_without_fetch(_patch):
    state, cache = _patch
    # Seed a fully-covering cache window (tolerance is 5 days).
    cache["rows"] = [_cached_row(f"2024-01-{d:02d}") for d in range(2, 31)]

    req = PriceHistoryRequest(ticker="HIMS", start=date(2024, 1, 3), end=date(2024, 1, 29))
    result = mod.get_price_history(req)

    assert result.source == "cache"
    assert result.ticker == "HIMS"
    assert len(result.bars) == len(cache["rows"])
    assert state["fetch_called"] is False
    assert state["upsert_called"] is False


def test_full_miss_triggers_openbb_backfill(_patch):
    state, cache = _patch
    cache["rows"] = []

    req = PriceHistoryRequest(ticker="NKE", start=date(2024, 1, 1), end=date(2024, 1, 31))
    result = mod.get_price_history(req)

    assert state["fetch_called"] is True
    assert state["upsert_called"] is True
    assert state["last_fetch"] == ("NKE", "2024-01-01", "2024-01-31")
    assert result.source == "openbb"


def test_tail_gap_triggers_partial_backfill(_patch):
    state, cache = _patch
    # Cache covers Jan 1–10 but request goes to Jan 31 → tail gap.
    cache["rows"] = [_cached_row(f"2024-01-{d:02d}") for d in range(1, 11)]

    req = PriceHistoryRequest(ticker="HIMS", start=date(2024, 1, 1), end=date(2024, 1, 31))
    result = mod.get_price_history(req)

    assert state["fetch_called"] is True
    assert state["last_fetch"][0] == "HIMS"
    assert state["last_fetch"][1] == "2024-01-11"
    assert state["last_fetch"][2] == "2024-01-31"
    assert result.source == "cache+backfill"
    assert state["upsert_called"] is True


def test_head_gap_triggers_partial_backfill(_patch):
    state, cache = _patch
    # Cache covers only the tail; request starts 30 days earlier.
    cache["rows"] = [_cached_row(f"2024-01-{d:02d}") for d in range(25, 31)]

    req = PriceHistoryRequest(ticker="HIMS", start=date(2023, 12, 1), end=date(2024, 1, 30))
    result = mod.get_price_history(req)

    assert state["fetch_called"] is True
    assert state["last_fetch"][1] == "2023-12-01"
    assert state["last_fetch"][2] == "2024-01-24"
    assert result.source == "cache+backfill"


def test_edge_tolerance_allows_small_tail_gap(_patch):
    state, cache = _patch
    # End of window within 5 days of latest cached row → treat as complete.
    cache["rows"] = [_cached_row(f"2024-01-{d:02d}") for d in range(1, 29)]

    req = PriceHistoryRequest(ticker="HIMS", start=date(2024, 1, 1), end=date(2024, 1, 31))
    result = mod.get_price_history(req)

    assert result.source == "cache"
    assert state["fetch_called"] is False


def test_ticker_is_uppercased(_patch):
    _, cache = _patch
    cache["rows"] = [_cached_row(f"2024-01-{d:02d}") for d in range(1, 31)]

    req = PriceHistoryRequest(ticker=" hims ", start=date(2024, 1, 1), end=date(2024, 1, 31))
    result = mod.get_price_history(req)

    assert result.ticker == "HIMS"
