"""Build a ``RenderChartRequest`` from a ``TradeRecord``.

Cross-tool integration: the simulation engine calls
``simualpha_quant.tools.render_chart.render_tli_chart`` in-process
(never HTTP / MCP) to produce an annotated PNG of each representative
trade. This module builds the ``AnnotationsSpec`` that captures the
trade's story: entry tranches, stop, take-profit legs, outcome badge.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Sequence

from simualpha_quant.execution.trade_log import TradeRecord
from simualpha_quant.schemas.charts import (
    AnnotationsSpec,
    Badge,
    ChartConfig,
    DateRange,
    EntryTranche,
    HorizontalLine,
    RenderChartRequest,
    WaveLabel,
    Zone,
)


@dataclass(frozen=True)
class TradeChartInputs:
    """Context the engine knows that the TradeRecord alone doesn't carry."""
    stop_loss_price: float | None = None
    take_profit_prices: list[tuple[float, str]] = ()  # (price, label)
    wave_1_anchor: tuple[date, float] | None = None   # (date, price)
    wave_2_anchor: tuple[date, float] | None = None
    confluence_zone: tuple[float, float] | None = None  # (low, high) dollar


DEFAULT_WINDOW_PRE_DAYS = 180
DEFAULT_WINDOW_POST_DAYS = 30


def build_chart_request(
    trade: TradeRecord,
    *,
    inputs: TradeChartInputs = TradeChartInputs(),
    width: int = 1280,
    height: int = 720,
) -> RenderChartRequest:
    """Construct a RenderChartRequest for a single trade.

    The caller (simulate.py) should supply ``inputs`` with the
    pattern-specific anchors / zones / stop / TP prices it already
    computed; this module only builds the AnnotationsSpec.
    """
    start = trade.entry_date - timedelta(days=DEFAULT_WINDOW_PRE_DAYS)
    end = (trade.exit_date or trade.entry_date) + timedelta(days=DEFAULT_WINDOW_POST_DAYS)

    tranches = [
        EntryTranche(price=price, pct=pct, label=f"T{i + 1}")
        for i, (_d, price, pct) in enumerate(trade.tranche_entries)
    ]

    h_lines: list[HorizontalLine] = []
    if inputs.stop_loss_price is not None:
        h_lines.append(
            HorizontalLine(price=inputs.stop_loss_price, kind="bearish_flip", label="Stop")
        )
    for price, label in (inputs.take_profit_prices or []):
        h_lines.append(HorizontalLine(price=price, kind="resistance", label=label))

    zones: list[Zone] = []
    if inputs.confluence_zone is not None:
        low, high = inputs.confluence_zone
        zones.append(
            Zone(low=low, high=high, label="CONFLUENCE ZONE", color="#A855F7", opacity=0.22)
        )

    wave_labels: list[WaveLabel] = []
    if inputs.wave_1_anchor is not None:
        d, p = inputs.wave_1_anchor
        wave_labels.append(WaveLabel(wave_id="1", wave_type="impulse", price=p, date=d, label="Wave 1"))
    if inputs.wave_2_anchor is not None:
        d, p = inputs.wave_2_anchor
        wave_labels.append(WaveLabel(wave_id="2", wave_type="corrective", price=p, date=d, label="Wave 2"))

    badge_text, badge_color = _outcome_badge(trade)
    badges = [Badge(text=badge_text, placement="top", color=badge_color, style="pill")]

    caption = _caption(trade)

    return RenderChartRequest(
        ticker=trade.ticker,
        timeframe="daily",
        date_range=DateRange(start=start, end=end),
        annotations=AnnotationsSpec(
            horizontal_lines=h_lines,
            zones=zones,
            wave_labels=wave_labels,
            entry_tranches=tranches,
            badges=badges,
            caption=caption,
        ),
        config=ChartConfig(width=width, height=height, theme="dark"),
    )


def _outcome_badge(trade: TradeRecord) -> tuple[str, str]:
    pct = trade.pct_return * 100.0
    if trade.is_win:
        return f"WIN +{pct:.1f}%", "#22C55E"
    return f"LOSS {pct:.1f}%", "#EF4444"


def _caption(trade: TradeRecord) -> str:
    entry = f"${trade.entry_price:.2f}"
    exit_ = f"${trade.exit_price:.2f}" if trade.exit_price is not None else "open"
    span = (trade.exit_date or trade.entry_date) - trade.entry_date
    return f"{trade.ticker}  ·  entry {entry}  ·  exit {exit_}  ·  {span.days}d hold"
