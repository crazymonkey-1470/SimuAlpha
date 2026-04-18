"""Theme + figure layout for the TLI chart renderer.

Defines the default TLI color palette, the SimuAlpha dark/light themes,
and the watermark drawer. Callers can override any color at the
annotation level.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import mplfinance as mpf

# ───────────────────────── color palette (TLI legend) ─────────────────────────

# Blue for long-term S/R.
SR_BLUE = "#3B82F6"
# Bullish / bearish flip lines.
FLIP_GREEN = "#22C55E"
FLIP_RED = "#EF4444"
# Yellow 200-period MA default.
MA_YELLOW = "#FACC15"
# Impulse / corrective wave circles.
IMPULSE_GREEN = "#16A34A"
CORRECTIVE_RED = "#DC2626"
# Fib color ladder (0.236, 0.382, 0.5, 0.618, 0.786).
FIB_COLORS: dict[float, str] = {
    0.236: "#60A5FA",
    0.382: "#3B82F6",
    0.5:   "#6366F1",
    0.618: "#A855F7",
    0.786: "#F97316",
}
FIB_EXT_COLORS: dict[float, str] = {
    1.0:   "#14B8A6",
    1.272: "#10B981",
    1.618: "#22C55E",
    2.0:   "#EAB308",
    2.618: "#F59E0B",
}


@dataclass(frozen=True)
class Theme:
    name: Literal["light", "dark"]
    face: str
    axis_face: str
    grid: str
    text: str
    candle_up: str
    candle_down: str
    wick: str
    edge: str
    watermark: str


DARK = Theme(
    name="dark",
    face="#0B1220",
    axis_face="#0B1220",
    grid="#1F2937",
    text="#E5E7EB",
    candle_up="#22C55E",
    candle_down="#EF4444",
    wick="#94A3B8",
    edge="#334155",
    watermark="#FFFFFF",
)

LIGHT = Theme(
    name="light",
    face="#FFFFFF",
    axis_face="#FFFFFF",
    grid="#E5E7EB",
    text="#0F172A",
    candle_up="#16A34A",
    candle_down="#DC2626",
    wick="#475569",
    edge="#CBD5E1",
    watermark="#0F172A",
)


def get_theme(name: str) -> Theme:
    return DARK if name == "dark" else LIGHT


def mpf_style(theme: Theme):
    """Build a mplfinance style object for a theme."""
    marketcolors = mpf.make_marketcolors(
        up=theme.candle_up,
        down=theme.candle_down,
        edge={"up": theme.candle_up, "down": theme.candle_down},
        wick=theme.wick,
        volume={"up": theme.candle_up, "down": theme.candle_down},
    )
    return mpf.make_mpf_style(
        base_mpf_style="nightclouds" if theme.name == "dark" else "classic",
        marketcolors=marketcolors,
        facecolor=theme.face,
        edgecolor=theme.edge,
        gridcolor=theme.grid,
        gridstyle="-",
        y_on_right=True,
        rc={
            "axes.labelcolor": theme.text,
            "xtick.color": theme.text,
            "ytick.color": theme.text,
            "axes.titlecolor": theme.text,
            "figure.facecolor": theme.face,
            "axes.facecolor": theme.axis_face,
            "savefig.facecolor": theme.face,
        },
    )


def figsize(width_px: int, height_px: int, dpi: int = 100) -> tuple[float, float]:
    return (width_px / dpi, height_px / dpi)


def draw_watermark(fig, text: str, theme: Theme) -> None:
    if not text:
        return
    fig.text(
        0.99,
        0.015,
        text,
        ha="right",
        va="bottom",
        fontsize=10,
        color=theme.watermark,
        alpha=0.15,
        weight="bold",
    )


def default_ma_period_for(timeframe: str) -> int:
    # All three come out to 200 periods on their respective scale.
    return 200


def default_ma_color() -> str:
    return MA_YELLOW
