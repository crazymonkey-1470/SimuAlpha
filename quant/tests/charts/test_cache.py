"""Cache-hit / miss flow for render_tli_chart."""

from __future__ import annotations

from datetime import date

import pytest

from simualpha_quant.schemas.charts import DateRange, RenderChartRequest
from simualpha_quant.tools import render_chart as mod


@pytest.fixture()
def patched(monkeypatch):
    state = {"render_called": False, "upload_called": False, "exists_returns": None}

    def fake_exists(ticker, timeframe, h):  # noqa: ARG001
        return state["exists_returns"]

    def fake_upload(ticker, timeframe, h, png):  # noqa: ARG001
        state["upload_called"] = True
        from simualpha_quant.charts.storage import StoredChart

        return StoredChart(url=f"https://cdn.example/{ticker}/{timeframe}/{h}.png", path="x")

    def fake_render(req):  # noqa: ARG001
        state["render_called"] = True
        return b"\x89PNG\r\n\x1a\n" + b"\x00" * 64

    def fake_index(req, h, url):  # noqa: ARG001
        return None

    monkeypatch.setattr(mod.storage, "chart_exists", fake_exists)
    monkeypatch.setattr(mod.storage, "upload_chart", fake_upload)
    monkeypatch.setattr(mod.tli_renderer, "render", fake_render)
    monkeypatch.setattr(mod, "_record_index", fake_index)
    return state


def _req() -> RenderChartRequest:
    return RenderChartRequest(
        ticker="HIMS",
        timeframe="daily",
        date_range=DateRange(start=date(2024, 1, 1), end=date(2024, 6, 30)),
    )


def test_cache_hit_skips_render(patched):
    from simualpha_quant.charts.storage import StoredChart

    patched["exists_returns"] = StoredChart(url="https://cdn.example/cached.png", path="x")

    resp = mod.render_tli_chart(_req())
    assert resp.cached is True
    assert resp.url == "https://cdn.example/cached.png"
    assert patched["render_called"] is False
    assert patched["upload_called"] is False


def test_cache_miss_renders_and_uploads(patched):
    patched["exists_returns"] = None

    resp = mod.render_tli_chart(_req())
    assert resp.cached is False
    assert resp.url.endswith(".png")
    assert patched["render_called"] is True
    assert patched["upload_called"] is True


def test_response_carries_dimensions(patched):
    patched["exists_returns"] = None

    resp = mod.render_tli_chart(_req())
    assert resp.width == 1200
    assert resp.height == 700
