"""Annotation renderers — one function per kind in AnnotationsSpec.

These are called by `charts.tli_renderer` after mplfinance has laid out
the candle + volume axes. Each function receives the price axis (``ax``)
and mutates it. Nothing returns a figure.
"""

from __future__ import annotations

import pandas as pd
from matplotlib.axes import Axes
from matplotlib.patches import FancyBboxPatch, Rectangle

from simualpha_quant.charts.layout import (
    CORRECTIVE_RED,
    FIB_COLORS,
    FIB_EXT_COLORS,
    FLIP_GREEN,
    FLIP_RED,
    IMPULSE_GREEN,
    SR_BLUE,
    Theme,
)
from simualpha_quant.schemas.charts import (
    Badge,
    EntryTranche,
    FibLevel,
    HorizontalLine,
    WaveLabel,
    Zone,
)

_STYLE_TO_LS = {"solid": "-", "dashed": "--", "dotted": ":"}


def _fib_color(level: float) -> str:
    if level in FIB_COLORS:
        return FIB_COLORS[level]
    if level in FIB_EXT_COLORS:
        return FIB_EXT_COLORS[level]
    # Nearest match
    closest = min(FIB_COLORS.keys() | FIB_EXT_COLORS.keys(), key=lambda k: abs(k - level))
    return FIB_COLORS.get(closest) or FIB_EXT_COLORS[closest]


def _line_color(kind: str) -> str:
    return {
        "support": SR_BLUE,
        "resistance": SR_BLUE,
        "bullish_flip": FLIP_GREEN,
        "bearish_flip": FLIP_RED,
    }.get(kind, SR_BLUE)


# ──────────────────────────── fibonacci ────────────────────────────


def draw_fibs(ax: Axes, levels: list[FibLevel], theme: Theme) -> None:
    if not levels:
        return
    xmin, xmax = ax.get_xlim()
    for lvl in levels:
        color = lvl.color or _fib_color(lvl.level)
        ls = _STYLE_TO_LS.get(lvl.style, "--")
        ax.hlines(lvl.price, xmin=xmin, xmax=xmax, colors=color, linestyles=ls, linewidth=1.1, alpha=0.9)
        label = lvl.label or f"{lvl.level:.3f}"
        ax.text(
            xmax,
            lvl.price,
            f"  {label}",
            color=color,
            fontsize=9,
            va="center",
            ha="left",
            alpha=0.95,
        )


# ──────────────────────────── horizontal lines ────────────────────────────


def draw_horizontals(ax: Axes, lines: list[HorizontalLine], theme: Theme) -> None:
    if not lines:
        return
    xmin, xmax = ax.get_xlim()
    for hl in lines:
        color = _line_color(hl.kind)
        ax.hlines(hl.price, xmin=xmin, xmax=xmax, colors=color, linewidth=1.4, alpha=0.9)
        if hl.label:
            ax.text(
                xmin,
                hl.price,
                f"{hl.label}  ",
                color=color,
                fontsize=9,
                va="center",
                ha="right",
                alpha=0.95,
            )


# ──────────────────────────── zones ────────────────────────────


def draw_zones(ax: Axes, zones: list[Zone], theme: Theme) -> None:
    if not zones:
        return
    xmin, xmax = ax.get_xlim()
    for z in zones:
        low, high = sorted([z.low, z.high])
        color = z.color or "#FBBF24"
        ax.add_patch(
            Rectangle(
                (xmin, low),
                xmax - xmin,
                high - low,
                linewidth=0,
                facecolor=color,
                alpha=max(0.0, min(1.0, z.opacity)),
                zorder=0,
            )
        )
        if z.label:
            ax.text(
                xmin,
                (low + high) / 2.0,
                f"{z.label}  ",
                color=theme.text,
                fontsize=9,
                va="center",
                ha="right",
                alpha=0.85,
            )


# ──────────────────────────── waves ────────────────────────────


def _date_to_x(dates: pd.DatetimeIndex, target) -> float | None:
    ts = pd.Timestamp(target)
    if len(dates) == 0:
        return None
    idx = dates.searchsorted(ts)
    if idx >= len(dates):
        idx = len(dates) - 1
    # mplfinance uses integer positions on the x-axis
    return float(idx)


def draw_waves(ax: Axes, waves: list[WaveLabel], dates: pd.DatetimeIndex, theme: Theme) -> None:
    if not waves:
        return
    for w in waves:
        x = _date_to_x(dates, w.date)
        if x is None:
            continue
        color = IMPULSE_GREEN if w.wave_type == "impulse" else CORRECTIVE_RED
        ax.scatter(x, w.price, s=140, color=color, edgecolors=theme.text, linewidths=1.2, zorder=5)
        ax.annotate(
            w.label or w.wave_id,
            xy=(x, w.price),
            xytext=(6, 8),
            textcoords="offset points",
            color=theme.text,
            fontsize=9,
            weight="bold",
        )


# ──────────────────────────── entry tranches ────────────────────────────


def draw_entry_tranches(ax: Axes, tranches: list[EntryTranche], theme: Theme) -> None:
    if not tranches:
        return
    xmin, xmax = ax.get_xlim()
    for t in tranches:
        pct_text = f"{int(round(t.pct * 100))}%"
        ax.annotate(
            f"▶ {pct_text} · {t.label}",
            xy=(xmax, t.price),
            xytext=(-4, 0),
            textcoords="offset points",
            color=theme.text,
            fontsize=9,
            ha="right",
            va="center",
            bbox=dict(boxstyle="round,pad=0.18", fc="#1E293B", ec="#334155", lw=0.6, alpha=0.85),
        )


# ──────────────────────────── badges ────────────────────────────


def draw_badges(ax: Axes, badges: list[Badge], theme: Theme) -> None:
    if not badges:
        return
    xmin, xmax = ax.get_xlim()
    ymin, ymax = ax.get_ylim()
    yspan = ymax - ymin
    top_slot = ymax - 0.04 * yspan
    bottom_slot = ymin + 0.04 * yspan
    for i, b in enumerate(badges):
        if b.placement == "bottom":
            y = bottom_slot + i * 0.03 * yspan
        elif b.placement == "near_zone":
            y = ymin + 0.5 * yspan
        else:
            y = top_slot - i * 0.05 * yspan
        bg = b.color or "#F97316"
        fg = theme.face if theme.name == "dark" else "#FFFFFF"
        ax.text(
            (xmin + xmax) / 2.0,
            y,
            b.text,
            color=fg,
            fontsize=11,
            weight="bold",
            ha="center",
            va="center",
            bbox=dict(boxstyle="round,pad=0.5", fc=bg, ec=bg, alpha=0.95),
        )


# ──────────────────────────── caption ────────────────────────────


def draw_caption(fig, text: str | None, theme: Theme) -> None:
    if not text:
        return
    fig.text(
        0.5,
        0.955,
        text,
        ha="center",
        va="top",
        fontsize=11,
        color=theme.text,
        alpha=0.92,
    )
