"""Spec-hash determinism tests."""

from __future__ import annotations

from datetime import date

from simualpha_quant.schemas.charts import (
    AnnotationsSpec,
    ChartConfig,
    DateRange,
    FibLevel,
    HorizontalLine,
    RenderChartRequest,
)
from simualpha_quant.tools.render_chart import spec_hash


def _req(annotations=None, config=None) -> RenderChartRequest:
    return RenderChartRequest(
        ticker="HIMS",
        timeframe="daily",
        date_range=DateRange(start=date(2024, 1, 1), end=date(2024, 6, 30)),
        annotations=annotations or AnnotationsSpec(),
        config=config or ChartConfig(),
    )


def test_identical_specs_hash_identically():
    a = spec_hash(_req())
    b = spec_hash(_req())
    assert a == b
    assert len(a) == 32


def test_ticker_case_normalized_at_request_layer():
    h1 = spec_hash(_req())  # HIMS
    r2 = RenderChartRequest(
        ticker=" hims ",
        timeframe="daily",
        date_range=DateRange(start=date(2024, 1, 1), end=date(2024, 6, 30)),
    )
    assert spec_hash(r2) == h1


def test_different_dates_change_hash():
    h1 = spec_hash(_req())
    r2 = _req()
    r2 = RenderChartRequest(
        ticker="HIMS",
        timeframe="daily",
        date_range=DateRange(start=date(2024, 1, 2), end=date(2024, 6, 30)),
    )
    assert spec_hash(r2) != h1


def test_different_annotations_change_hash():
    base = spec_hash(_req())
    annotated = spec_hash(
        _req(
            annotations=AnnotationsSpec(
                fibonacci_levels=[FibLevel(level=0.618, price=20.0)],
            )
        )
    )
    assert annotated != base


def test_annotation_field_order_independent():
    a = AnnotationsSpec(
        fibonacci_levels=[FibLevel(level=0.382, price=10.0), FibLevel(level=0.618, price=20.0)],
        horizontal_lines=[HorizontalLine(price=15.0, kind="support")],
    )
    b = AnnotationsSpec(
        horizontal_lines=[HorizontalLine(price=15.0, kind="support")],
        fibonacci_levels=[FibLevel(level=0.382, price=10.0), FibLevel(level=0.618, price=20.0)],
    )
    assert spec_hash(_req(annotations=a)) == spec_hash(_req(annotations=b))


def test_config_change_changes_hash():
    base = spec_hash(_req())
    other = spec_hash(_req(config=ChartConfig(width=1600)))
    assert other != base
