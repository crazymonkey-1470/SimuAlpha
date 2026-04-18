"""Single source of truth for every TLI scoring / pattern constant.

Stage 3 pattern detectors and any future TLI-derived code import from
this module — never hard-code these values elsewhere. See
``docs/tli-constants.md`` for the full reference with file:line
citations from the existing SimuAlpha codebase.

When a value is exposed as a tunable parameter on a detector, the
module-level constant here remains the **default**.
"""

from __future__ import annotations

from typing import Final

# ─────────────────────────── 1. Fibonacci ratios ───────────────────────────

FIB_236: Final[float] = 0.236
FIB_382: Final[float] = 0.382
FIB_500: Final[float] = 0.5
FIB_618: Final[float] = 0.618
FIB_786: Final[float] = 0.786
FIB_1000: Final[float] = 1.0
FIB_1618: Final[float] = 1.618
FIB_2000: Final[float] = 2.0
FIB_2618: Final[float] = 2.618

WAVE_2_RETRACE_LOW: Final[float] = FIB_500   # Wave 2 entry lower bound
WAVE_2_RETRACE_HIGH: Final[float] = FIB_618  # Wave 2 entry primary
WAVE_4_RETRACE: Final[float] = FIB_382       # Wave 4 ADD zone
WAVE_3_TARGET_MULT: Final[float] = FIB_1618  # Wave 3 target = wave2_low + 1.618*W1
WAVE_5_BASE_MULT: Final[float] = FIB_1000    # Wave 5 base = wave4_low + 1.0*W1
WAVE_5_EXTENDED_MULT: Final[float] = FIB_2618
WAVE_C_TARGET: Final[float] = FIB_618        # Wave C target = 0.618 of entire impulse
EXTENDED_W3_TRIGGER_MULT: Final[float] = FIB_2000  # W3 > 2.0 * W1 -> extended


# ─────────────────────────── 2. Confluence-zone tolerances ──────────────────

# CONFLUENCE ZONE: 200WMA + 0.618 Fib within this fraction of each other,
# and price within this fraction of either.
CONFLUENCE_ZONE_TOLERANCE: Final[float] = 0.03  # 3 %

# Generic distance check (price near a single support level).
CONFLUENCE_PROXIMITY: Final[float] = 0.03  # 3 %

# GENERATIONAL SUPPORT: spread of {0.786 fib, Wave 1 origin, 200MMA}
# divided by their mean must be below this fraction, AND price must be
# within CONFLUENCE_PROXIMITY of the mean.
GENERATIONAL_TOLERANCE: Final[float] = 0.15  # 15 %

# Round-dollar level proximity.
ROUND_NUMBER_TOLERANCE: Final[float] = 0.02  # 2 %


# ─────────────────────────── 3. Pivot-detection sensitivity ─────────────────

PIVOT_SENSITIVITY_PRIMARY: Final[float] = 0.15      # monthly chart
PIVOT_SENSITIVITY_INTERMEDIATE: Final[float] = 0.08  # weekly chart


# ─────────────────────────── 4. Fib-relationship validation tolerances ──────

# Default tolerance when checking "is X close to ratio Y".
FIB_VALIDATION_TOLERANCE: Final[float] = 0.15  # 15 %

# Tighter tolerance specifically for Wave 4 = 0.382 of Wave 3.
WAVE4_FIB_VALIDATION_TOLERANCE: Final[float] = 0.10  # 10 %


# ─────────────────────────── 5. Moving averages ─────────────────────────────

MA_FAST_PERIOD: Final[int] = 50    # Wave 2 confirmation MA
MA_SLOW_PERIOD: Final[int] = 200   # 200d / 200w / 200m (period count)


# ─────────────────────────── 6. Confluence scoring weights ──────────────────

CONF_PREVIOUS_LOW: Final[int] = 3
CONF_ROUND_NUMBER: Final[int] = 2
CONF_50MA: Final[int] = 3
CONF_200MA: Final[int] = 4
CONF_200WMA: Final[int] = 5
CONF_FIB_0382: Final[int] = 3
CONF_FIB_050: Final[int] = 4
CONF_FIB_0618: Final[int] = 5
CONF_FIB_0786: Final[int] = 4
CONF_WAVE1_ORIGIN: Final[int] = 5
CONFLUENCE_ZONE_BONUS: Final[int] = 15
GENERATIONAL_BUY_BONUS: Final[int] = 20


# ─────────────────────────── 7. Wave-position scores ────────────────────────

WAVE_SCORE_C_BOTTOM: Final[int] = 30
WAVE_SCORE_2_BOTTOM: Final[int] = 25
WAVE_SCORE_4_SUPPORT: Final[int] = 20
WAVE_SCORE_A_BOTTOM: Final[int] = 15
WAVE_SCORE_1_FORMING: Final[int] = 10
WAVE_SCORE_3_IN_PROGRESS: Final[int] = 5
WAVE_SCORE_5_IN_PROGRESS: Final[int] = 0
WAVE_SCORE_B_BOUNCE: Final[int] = -10
WAVE_SCORE_ENDING_DIAGONAL: Final[int] = -15


# ─────────────────────────── 8. Action labels ───────────────────────────────

LABEL_LOAD_THE_BOAT: Final[str] = "LOAD THE BOAT"
LABEL_ACCUMULATE: Final[str] = "ACCUMULATE"
LABEL_WATCHLIST: Final[str] = "WATCHLIST"
LABEL_HOLD: Final[str] = "HOLD"
LABEL_CAUTION: Final[str] = "CAUTION"
LABEL_TRIM: Final[str] = "TRIM"
LABEL_AVOID: Final[str] = "AVOID"

# (lower_inclusive, upper_inclusive, label) — sorted descending.
ACTION_LABEL_BANDS: Final[tuple[tuple[int, int, str], ...]] = (
    (85, 100, LABEL_LOAD_THE_BOAT),
    (70, 84, LABEL_ACCUMULATE),
    (55, 69, LABEL_WATCHLIST),
    (40, 54, LABEL_HOLD),
    (25, 39, LABEL_CAUTION),
    (10, 24, LABEL_TRIM),
    (0, 9, LABEL_AVOID),
)


def label_for_score(score: int) -> str:
    """Map a 0-100 TLI score to its action label."""
    for lo, hi, name in ACTION_LABEL_BANDS:
        if lo <= score <= hi:
            return name
    return LABEL_AVOID


# ─────────────────────────── 9. 5-tranche position sizing ───────────────────

TRANCHE_PCTS: Final[tuple[float, ...]] = (0.10, 0.15, 0.20, 0.25, 0.30)
assert abs(sum(TRANCHE_PCTS) - 1.0) < 1e-9, "TRANCHE_PCTS must sum to 1.0"


# ─────────────────────────── 10. Position-sizing modifiers ──────────────────

VOLATILITY_HIGH_FACTOR: Final[float] = 0.75
CONVICTION_HIGH_FACTOR: Final[float] = 1.15
PORTFOLIO_CONCENTRATION_WARN: Final[float] = 0.15
STOP_LOSS_PCT: Final[float] = 0.15  # default stop at -15 %


# ─────────────────────────── 11. Risk-filter thresholds ─────────────────────

DOWNTREND_THRESHOLD: Final[int] = 4   # of 8 signals; >= suppresses non-GENERATIONAL buys
CHASE_FILTER_PCT: Final[int] = 20     # don't chase when > 20 % above support
EARNINGS_BLACKOUT_DAYS: Final[int] = 14
SENTIMENT_BOOST: Final[int] = 5


# ─────────────────────────── 12. Wave B → corrective classification ─────────

WAVE_B_ZIGZAG_MAX: Final[float] = 0.618
WAVE_B_REGULAR_FLAT_LOW: Final[float] = 0.90
WAVE_B_REGULAR_FLAT_HIGH: Final[float] = 1.00


# ─────────────────────────── Module-level safety check ──────────────────────

# Defensive: anything that imports `*` from here should still get a
# stable, documented public surface.
__all__ = [
    name
    for name in dir()
    if name.isupper()
    or name in {"label_for_score", "ACTION_LABEL_BANDS", "TRANCHE_PCTS"}
]
