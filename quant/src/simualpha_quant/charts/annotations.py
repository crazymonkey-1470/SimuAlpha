"""Annotation renderers — one function per kind in AnnotationsSpec.

These are called by `charts.tli_renderer` after mplfinance has laid out
the candle + volume axes. Each function receives the price axis (``ax``)
and mutates it. Nothing returns a figure.

All labels are clamped inside the chart area so they never bleed onto
the y-axis tick column or into the volume panel.
"""

from __future__ import annotations

import pandas as pd
from matplotlib.axes import Axes
from matplotlib.patches import Rectangle
from matplotlib.transforms import blended_transform_factory

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

# Padding (in axis fraction) for inside-the-chart labels.
_PAD_X = 0.012
_PAD_Y = 0.012


def _safe(text: str | None) -> str:
    """Escape characters matplotlib treats as mathtext delimiters.

    Agent-supplied labels routinely contain '$' (price levels). Without
    escaping, matplotlib parses '$X$' as math mode and silently drops the
    '$' characters from the rendered output.
    """
    if text is None:
        return ""
    return text.replace("$", r"\$")


def _fib_color(level: float) -> str:
    if level in FIB_COLORS:
        return FIB_COLORS[level]
    if level in FIB_EXT_COLORS:
        return FIB_EXT_COLORS[level]
    closest = min(FIB_COLORS.keys() | FIB_EXT_COLORS.keys(), key=lambda k: abs(k - level))
    return FIB_COLORS.get(closest) or FIB_EXT_COLORS[closest]


def _line_color(kind: str) -> str:
    return {
        "support": SR_BLUE,
        "resistance": SR_BLUE,
        "bullish_flip": FLIP_GREEN,
        "bearish_flip": FLIP_RED,
    }.get(kind, SR_BLUE)


def _ylim_clamped(ax: Axes, price: float) -> float | None:
    """Return price if inside ylim, else None. Lets us silently skip
    annotations that fall outside the visible price range."""
    ymin, ymax = ax.get_ylim()
    return price if (ymin <= price <= ymax) else None


# ──────────────────────────── fibonacci ────────────────────────────


def draw_fibs(ax: Axes, levels: list[FibLevel], theme: Theme) -> None:
    if not levels:
        return
    trans = blended_transform_factory(ax.transAxes, ax.transData)
    for lvl in levels:
        if _ylim_clamped(ax, lvl.price) is None:
            continue
        color = lvl.color or _fib_color(lvl.level)
        ls = _STYLE_TO_LS.get(lvl.style, "--")
        ax.axhline(lvl.price, color=color, linestyle=ls, linewidth=1.1, alpha=0.9)
        label = _safe(lvl.label) if lvl.label else f"{lvl.level:.3f}"
        # Inside the chart, anchored at right with a small inset.
        ax.text(
            1.0 - _PAD_X,
            lvl.price,
            label,
            transform=trans,
            color=color,
            fontsize=9,
            va="center",
            ha="right",
            alpha=0.95,
            bbox=dict(boxstyle="round,pad=0.22", fc=theme.face, ec="none", alpha=0.82),
            zorder=4,
        )


# ──────────────────────────── horizontal lines ────────────────────────────


def draw_horizontals(
    ax: Axes,
    lines: list[HorizontalLine],
    theme: Theme,
    *,
    zone_y_centers: tuple[float, ...] = (),
) -> None:
    if not lines:
        return
    trans = blended_transform_factory(ax.transAxes, ax.transData)
    ymin, ymax = ax.get_ylim()
    yspan = max(ymax - ymin, 1e-9)

    for hl in lines:
        if _ylim_clamped(ax, hl.price) is None:
            continue
        color = _line_color(hl.kind)
        ax.axhline(hl.price, color=color, linewidth=1.4, alpha=0.9)
        if not hl.label:
            continue

        # If a zone label is at this price (within 1.5% of yspan), push
        # the h-line label further right so they don't overlap.
        collide = any(abs(c - hl.price) / yspan < 0.015 for c in zone_y_centers)
        x_anchor = 0.55 if collide else 0.26

        ax.text(
            x_anchor,
            hl.price,
            _safe(hl.label),
            transform=trans,
            color=color,
            fontsize=9,
            va="center",
            ha="left",
            alpha=0.95,
            bbox=dict(boxstyle="round,pad=0.22", fc=theme.face, ec="none", alpha=0.82),
            zorder=4,
        )


# ──────────────────────────── zones ────────────────────────────


def draw_zones(ax: Axes, zones: list[Zone], theme: Theme) -> None:
    if not zones:
        return
    trans = blended_transform_factory(ax.transAxes, ax.transData)
    for z in zones:
        low, high = sorted([z.low, z.high])
        ymin, ymax = ax.get_ylim()
        # Fully outside view → skip.
        if high < ymin or low > ymax:
            continue
        low_v = max(low, ymin)
        high_v = min(high, ymax)
        color = z.color or "#FBBF24"
        ax.axhspan(low_v, high_v, facecolor=color, alpha=max(0.0, min(1.0, z.opacity)), zorder=0)
        if z.label:
            ax.text(
                0.26,
                (low_v + high_v) / 2.0,
                _safe(z.label),
                transform=trans,
                color="#0F172A",
                fontsize=9,
                weight="bold",
                va="center",
                ha="left",
                alpha=0.95,
                bbox=dict(boxstyle="round,pad=0.28", fc=color, ec="none", alpha=0.9),
                zorder=4,
            )


# ──────────────────────────── waves ────────────────────────────


def _date_to_x(dates: pd.DatetimeIndex, target) -> float | None:
    ts = pd.Timestamp(target)
    if len(dates) == 0 or ts < dates[0] or ts > dates[-1]:
        return None
    idx = dates.searchsorted(ts)
    if idx >= len(dates):
        idx = len(dates) - 1
    return float(idx)


def draw_waves(ax: Axes, waves: list[WaveLabel], dates: pd.DatetimeIndex, theme: Theme) -> None:
    if not waves:
        return
    for w in waves:
        x = _date_to_x(dates, w.date)
        if x is None or _ylim_clamped(ax, w.price) is None:
            continue
        color = IMPULSE_GREEN if w.wave_type == "impulse" else CORRECTIVE_RED
        ax.scatter(
            x,
            w.price,
            s=240,
            color=color,
            edgecolors=theme.text,
            linewidths=1.2,
            zorder=6,
            alpha=0.95,
        )
        ax.text(
            x,
            w.price,
            _safe(w.label or w.wave_id),
            color="#FFFFFF",
            fontsize=9,
            weight="bold",
            ha="center",
            va="center",
            zorder=7,
        )


# ──────────────────────────── entry tranches ────────────────────────────


def draw_entry_tranches(ax: Axes, tranches: list[EntryTranche], theme: Theme) -> None:
    """Render tranches at the LEFT edge of the price axis.

    The right edge is reserved for wave circles + fib level labels; the
    left edge is free for DCA ladder markers. Each tranche gets an
    arrow pointing right into the chart at its price and a pill label
    with "<pct> · <name>". When two tranches are within 2% of the
    visible y-range we stack the second slightly above the first.
    """
    if not tranches:
        return
    trans = blended_transform_factory(ax.transAxes, ax.transData)
    visible = [t for t in tranches if _ylim_clamped(ax, t.price) is not None]
    if not visible:
        return

    ymin, ymax = ax.get_ylim()
    yspan = max(ymax - ymin, 1e-9)
    # Stack with at least ~3.5% of yspan between labels so they don't overlap.
    min_gap = 0.035 * yspan
    visible_sorted = sorted(visible, key=lambda t: t.price)
    last_y: float | None = None
    for t in visible_sorted:
        y = t.price
        if last_y is not None and (y - last_y) < min_gap:
            y = last_y + min_gap
        last_y = y

        pct_text = f"{int(round(t.pct * 100))}%"
        ax.annotate(
            "",
            xy=(_PAD_X, t.price),
            xytext=(0.055, t.price),
            xycoords=trans,
            textcoords=trans,
            arrowprops=dict(arrowstyle="-|>", color="#FFFFFF", lw=1.2, alpha=0.9),
        )
        ax.text(
            0.06,
            y,
            _safe(pct_text),
            transform=trans,
            color="#F8FAFC",
            fontsize=8,
            weight="bold",
            ha="left",
            va="center",
            bbox=dict(boxstyle="round,pad=0.18", fc="#1E293B", ec="#334155", lw=0.6, alpha=0.92),
            zorder=5,
        )


# ──────────────────────────── badges ────────────────────────────


def draw_badges(ax: Axes, badges: list[Badge], theme: Theme) -> None:
    if not badges:
        return
    trans = blended_transform_factory(ax.transAxes, ax.transAxes)
    for i, b in enumerate(badges):
        if b.placement == "bottom":
            x, y, va, ha = 0.5, _PAD_Y + 0.04 * i, "bottom", "center"
        elif b.placement == "near_zone":
            x, y, va, ha = 0.5, 0.5, "center", "center"
        else:  # top
            x, y, va, ha = 0.5, 1.0 - _PAD_Y - 0.05 * i, "top", "center"
        bg = b.color or "#F97316"
        fg = "#FFFFFF" if theme.name == "dark" else "#0F172A"
        ax.text(
            x,
            y,
            _safe(b.text),
            transform=trans,
            color=fg,
            fontsize=11,
            weight="bold",
            ha=ha,
            va=va,
            zorder=8,
            bbox=dict(boxstyle="round,pad=0.5", fc=bg, ec=bg, alpha=0.95),
        )


# ──────────────────────────── caption ────────────────────────────


def draw_caption(fig, text: str | None, theme: Theme) -> None:
    if not text:
        return
    fig.suptitle(_safe(text), color=theme.text, fontsize=11, y=0.99)
