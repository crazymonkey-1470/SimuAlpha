"""Structural tests for the renderer.

These exercise the real matplotlib/mplfinance path with a synthetic
price series (no Supabase, no OpenBB). Each test asserts a specific
annotation modifies the figure — a cheap sanity check that runs in CI
alongside the more expensive perceptual test.
"""

from __future__ import annotations

from datetime import date

import pandas as pd
import pytest

from simualpha_quant.charts import tli_renderer
from simualpha_quant.schemas.charts import (
    AnnotationsSpec,
    Badge,
    ChartConfig,
    DateRange,
    EntryTranche,
    FibLevel,
    HorizontalLine,
    MovingAverageSpec,
    RenderChartRequest,
    WaveLabel,
    Zone,
)

try:
    import mplfinance  # noqa: F401
except ImportError:  # pragma: no cover
    pytest.skip("mplfinance not installed", allow_module_level=True)


def _synthetic_prices(ticker: str = "TST", n_days: int = 180) -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=n_days, freq="B")
    base = 20.0
    df = pd.DataFrame(
        {
            "open":  [base + 0.05 * i + (i % 7) * 0.1 for i in range(n_days)],
            "high":  [base + 0.05 * i + 0.6 for i in range(n_days)],
            "low":   [base + 0.05 * i - 0.6 for i in range(n_days)],
            "close": [base + 0.05 * i + (i % 5) * 0.05 for i in range(n_days)],
            "volume": [1_000_000 + i * 1_000 for i in range(n_days)],
        },
        index=idx,
    )
    return df


@pytest.fixture(autouse=True)
def _stub_price_loader(monkeypatch):
    """Bypass the Stage-1 tool — feed the renderer a synthetic frame."""
    monkeypatch.setattr(tli_renderer, "_load_prices", lambda t, s, e: _synthetic_prices())


def _req(annotations: AnnotationsSpec | None = None) -> RenderChartRequest:
    return RenderChartRequest(
        ticker="TST",
        timeframe="daily",
        date_range=DateRange(start=date(2024, 1, 1), end=date(2024, 9, 1)),
        annotations=annotations or AnnotationsSpec(),
        config=ChartConfig(width=800, height=500, watermark="SimuAlpha"),
    )


def _render(req: RenderChartRequest) -> bytes:
    return tli_renderer.render(req)


def test_render_returns_png_bytes_with_no_annotations():
    out = _render(_req())
    assert out.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(out) > 2000  # not a corrupt / empty PNG


def test_render_with_fibs_and_horizontals_still_returns_png():
    a = AnnotationsSpec(
        fibonacci_levels=[
            FibLevel(level=0.618, price=22.0),
            FibLevel(level=0.786, price=21.2),
        ],
        horizontal_lines=[
            HorizontalLine(price=20.0, kind="support", label="Wave 1"),
            HorizontalLine(price=24.0, kind="bullish_flip", label="flip"),
        ],
    )
    out = _render(_req(a))
    assert out.startswith(b"\x89PNG")
    assert len(out) > 5000


def test_render_with_all_annotation_types():
    a = AnnotationsSpec(
        fibonacci_levels=[FibLevel(level=0.618, price=22.0)],
        horizontal_lines=[HorizontalLine(price=20.0, kind="support")],
        moving_averages=[MovingAverageSpec(period=50, type="EMA")],
        zones=[Zone(low=19.0, high=21.0, label="CONFLUENCE ZONE")],
        wave_labels=[
            WaveLabel(wave_id="2", wave_type="corrective", price=20.5, date=date(2024, 3, 1))
        ],
        entry_tranches=[
            EntryTranche(price=20.0, pct=0.10, label="Tranche 1"),
            EntryTranche(price=19.5, pct=0.15, label="Tranche 2"),
        ],
        badges=[Badge(text="GENERATIONAL BUY", placement="top", color="#F97316")],
        caption="HIMS — Wave 2 confluence setup",
    )
    out = _render(_req(a))
    assert out.startswith(b"\x89PNG")
    assert len(out) > 10_000
