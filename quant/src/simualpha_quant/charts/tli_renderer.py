"""TLI chart renderer — Stage 2 implementation.

Renders an mplfinance candle chart and overlays the AnnotationsSpec
faithfully. The tool does NOT decide what to annotate; that is the
agent's job. Defaults applied only when an annotation field is empty.

When the renderer needs prices, it goes through `tools.get_price_history`
(cache-first via Supabase, OpenBB on miss) — never directly to OpenBB.
"""

from __future__ import annotations

import io
from datetime import date

import mplfinance as mpf
import pandas as pd

from simualpha_quant.charts import annotations as ann
from simualpha_quant.charts.layout import (
    DARK,
    MA_YELLOW,
    Theme,
    default_ma_color,
    default_ma_period_for,
    draw_watermark,
    figsize,
    get_theme,
    mpf_style,
)
from simualpha_quant.charts.resample import resample_ohlcv
from simualpha_quant.logging_config import get_logger
from simualpha_quant.schemas.charts import (
    AnnotationsSpec,
    ChartConfig,
    MovingAverageSpec,
    RenderChartRequest,
)

log = get_logger(__name__)


# ──────────────────────────── price loading ────────────────────────────


def _load_prices(ticker: str, start: date, end: date) -> pd.DataFrame:
    """Pull OHLCV via the Stage-1 cache-first tool. No OpenBB call here."""
    from simualpha_quant.schemas.prices import PriceHistoryRequest
    from simualpha_quant.tools.get_price_history import get_price_history

    history = get_price_history(
        PriceHistoryRequest(ticker=ticker, start=start, end=end, timeframe="daily")
    )
    if not history.bars:
        raise RuntimeError(f"no price data for {ticker} in {start}..{end}")

    df = pd.DataFrame([b.model_dump() for b in history.bars])
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").sort_index()
    df.rename(
        columns={
            "open": "open",
            "high": "high",
            "low": "low",
            "close": "close",
            "adj_close": "adj_close",
            "volume": "volume",
        },
        inplace=True,
    )
    return df


# ──────────────────────────── moving averages ────────────────────────────


# When the agent specifies several MAs without colors, cycle through these
# (the 200-period MA always stays yellow no matter where it sits in the list).
_MA_FALLBACK_COLORS: tuple[str, ...] = ("#FACC15", "#22D3EE", "#A855F7", "#F472B6", "#34D399")


def _resolve_mas(
    spec_mas: list[MovingAverageSpec], timeframe: str
) -> list[MovingAverageSpec]:
    if not spec_mas:
        return [MovingAverageSpec(period=default_ma_period_for(timeframe), type="SMA", color=MA_YELLOW)]
    resolved: list[MovingAverageSpec] = []
    color_idx = 0
    for ma in spec_mas:
        if ma.color is not None:
            resolved.append(ma)
            continue
        # 200-period MA always reserves yellow.
        if ma.period == 200:
            resolved.append(ma.model_copy(update={"color": MA_YELLOW}))
            continue
        chosen = _MA_FALLBACK_COLORS[color_idx % len(_MA_FALLBACK_COLORS)]
        if chosen == MA_YELLOW:
            color_idx += 1
            chosen = _MA_FALLBACK_COLORS[color_idx % len(_MA_FALLBACK_COLORS)]
        color_idx += 1
        resolved.append(ma.model_copy(update={"color": chosen}))
    return resolved


def _compute_ma(df: pd.DataFrame, spec: MovingAverageSpec) -> pd.Series:
    if spec.type == "EMA":
        return df["close"].ewm(span=spec.period, adjust=False).mean()
    return df["close"].rolling(window=spec.period, min_periods=1).mean()


# ──────────────────────────── render entry ────────────────────────────


def render(req: RenderChartRequest) -> bytes:
    """Render the chart per `req` and return PNG bytes."""
    log.info(
        "rendering chart",
        extra={
            "ticker": req.ticker,
            "timeframe": req.timeframe,
            "start": req.date_range.start.isoformat(),
            "end": req.date_range.end.isoformat(),
        },
    )

    daily = _load_prices(req.ticker, req.date_range.start, req.date_range.end)
    df = resample_ohlcv(daily, req.timeframe)
    if df.empty:
        raise RuntimeError(f"no bars after resample for {req.ticker} {req.timeframe}")

    theme: Theme = get_theme(req.config.theme)
    style = mpf_style(theme)

    mas = _resolve_mas(req.annotations.moving_averages, req.timeframe)
    ma_panels = []
    for ma in mas:
        series = _compute_ma(df, ma)
        ma_panels.append(
            mpf.make_addplot(
                series,
                color=ma.color or default_ma_color(),
                width=1.4,
                panel=0,
            )
        )

    fig, axlist = mpf.plot(
        df,
        type="candle",
        style=style,
        addplot=ma_panels,
        volume=req.config.show_volume,
        figsize=figsize(req.config.width, req.config.height),
        returnfig=True,
        datetime_format="%Y-%m-%d",
        xrotation=0,
        tight_layout=True,
        warn_too_much_data=10_000,
        update_width_config={"candle_linewidth": 0.9},
    )
    price_ax = axlist[0]

    # Apply annotations on top of the candles. Order matters:
    # zones first (background), then lines/fibs (mid), then waves +
    # tranches + badges + caption (foreground).
    a: AnnotationsSpec = req.annotations
    ann.draw_zones(price_ax, a.zones, theme)
    zone_centers = tuple((z.low + z.high) / 2.0 for z in a.zones)
    ann.draw_horizontals(price_ax, a.horizontal_lines, theme, zone_y_centers=zone_centers)
    ann.draw_fibs(price_ax, a.fibonacci_levels, theme)
    ann.draw_waves(price_ax, a.wave_labels, df.index, theme)
    ann.draw_entry_tranches(price_ax, a.entry_tranches, theme)
    ann.draw_badges(price_ax, a.badges, theme)
    ann.draw_caption(fig, a.caption, theme)

    if req.config.watermark:
        draw_watermark(fig, req.config.watermark, theme)

    buf = io.BytesIO()
    fig.savefig(
        buf,
        format="png",
        dpi=100,
        facecolor=theme.face,
        bbox_inches="tight",
        pad_inches=0.2,
    )
    # Avoid leaking figures across renders.
    import matplotlib.pyplot as plt

    plt.close(fig)
    return buf.getvalue()


# Backwards-compatible alias from the Stage 1 stub.
def render_tli_chart(*args, **kwargs):  # noqa: D401
    """Deprecated shim — use simualpha_quant.tools.render_chart.render_tli_chart."""
    raise NotImplementedError(
        "Use simualpha_quant.tools.render_chart.render_tli_chart for the agent-facing tool."
    )
