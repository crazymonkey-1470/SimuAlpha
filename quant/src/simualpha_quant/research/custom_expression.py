"""Custom-expression DSL for ad-hoc patterns.

A minimal JSON DSL that the agent can compose to express patterns
like "price within 2 % of 200-day MA AND 0.618 fib of prior swing".
The full grammar is documented in ``docs/custom-expression-dsl.md``.

Design constraints:
- No code execution. The DSL is interpreted; no eval / exec.
- Validation produces clear errors that point at the offending node.
- Operators are a closed set; unknown operators raise.
- Operands are a closed set; unknown sources raise.
- Output is a list of dates where the expression evaluated true.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

import numpy as np
import pandas as pd

from simualpha_quant.research.fibonacci import wave_1_retracement_levels
from simualpha_quant.research.patterns._base import (
    monthly_sma_aligned,
    sma,
    weekly_sma_aligned,
)
from simualpha_quant.research.waves import (
    detect_pivots,
    find_developing_wave_2,
    sensitivity_for_timeframe,
)
from simualpha_quant.tli_constants import PIVOT_SENSITIVITY_INTERMEDIATE

# ─────────────────────────── DSL types ──────────────────────────────────


class DSLError(ValueError):
    """Raised on any DSL validation or evaluation problem."""


@dataclass(frozen=True)
class _Ctx:
    """Per-ticker evaluation context shared across operand resolution."""
    prices: pd.DataFrame
    pivots: list
    developing_w2: list
    timeframe_sensitivity: float


# ─────────────────────────── operand resolution ─────────────────────────


_FIELD_NAMES: set[str] = {"$open", "$high", "$low", "$close", "$volume"}


def _resolve_operand(operand: Any, ctx: _Ctx) -> pd.Series | float:
    """Turn an operand into either a per-bar Series or a scalar float."""
    # Literal number.
    if isinstance(operand, (int, float)) and not isinstance(operand, bool):
        return float(operand)

    # Field reference.
    if isinstance(operand, str):
        if operand in _FIELD_NAMES:
            col = operand[1:]  # drop leading "$"
            if col not in ctx.prices.columns:
                raise DSLError(f"price column missing for {operand!r}")
            return ctx.prices[col].astype(float)
        raise DSLError(f"unknown operand string: {operand!r}")

    if not isinstance(operand, dict) or len(operand) != 1:
        raise DSLError(f"operand must be a literal, $field, or single-key dict; got {operand!r}")

    op, args = next(iter(operand.items()))

    if op == "sma":
        # {"sma": ["$close", 200, "weekly"]}
        if not isinstance(args, list) or len(args) != 3:
            raise DSLError("sma expects [field, period, freq]")
        field, period, freq = args
        series = _resolve_operand(field, ctx)
        if not isinstance(series, pd.Series):
            raise DSLError("sma 'field' must resolve to a series")
        if not isinstance(period, int) or period <= 0:
            raise DSLError("sma 'period' must be a positive int")
        if freq == "daily":
            return sma(series, period)
        if freq == "weekly":
            return weekly_sma_aligned(series, period)
        if freq == "monthly":
            return monthly_sma_aligned(series, period)
        raise DSLError(f"sma freq must be daily|weekly|monthly, got {freq!r}")

    if op == "ema":
        # {"ema": ["$close", 50]}
        if not isinstance(args, list) or len(args) != 2:
            raise DSLError("ema expects [field, period]")
        field, period = args
        series = _resolve_operand(field, ctx)
        if not isinstance(series, pd.Series):
            raise DSLError("ema 'field' must resolve to a series")
        if not isinstance(period, int) or period <= 0:
            raise DSLError("ema 'period' must be a positive int")
        return series.ewm(span=period, adjust=False).mean()

    if op == "fib":
        # {"fib": [0.618, "wave_1"]}
        if not isinstance(args, list) or len(args) != 2:
            raise DSLError("fib expects [level, wave]")
        level, wave = args
        if not isinstance(level, (int, float)):
            raise DSLError("fib 'level' must be numeric")
        if wave != "wave_1":
            raise DSLError("fib 'wave' must be 'wave_1' (only Wave 1 supported in Stage 3)")
        # Use the latest developing W2 anchors for fib reference.
        if not ctx.developing_w2:
            return float("nan")
        w1_start, w1_top, _ = ctx.developing_w2[-1]
        return wave_1_retracement_levels(w1_start, w1_top).get(float(level), float("nan"))

    if op == "wave_anchor":
        # {"wave_anchor": ["wave_1", "high"|"low"|"start"|"end"]}
        if not isinstance(args, list) or len(args) != 2:
            raise DSLError("wave_anchor expects [wave_id, kind]")
        wave_id, kind = args
        if wave_id != "wave_1":
            raise DSLError("Stage 3 wave_anchor supports only 'wave_1'")
        if not ctx.developing_w2:
            return float("nan")
        w1_start, w1_top, _ = ctx.developing_w2[-1]
        if kind in {"start", "low"}:
            return w1_start.price
        if kind in {"end", "high"}:
            return w1_top.price
        raise DSLError(f"wave_anchor kind must be start|end|low|high, got {kind!r}")

    raise DSLError(f"unknown operand operator {op!r}")


# ─────────────────────────── boolean/comparison ops ─────────────────────


def _to_bool_series(value: Any, ctx: _Ctx) -> pd.Series:
    if isinstance(value, bool):
        return pd.Series(value, index=ctx.prices.index)
    if isinstance(value, pd.Series):
        return value.fillna(False).astype(bool)
    if isinstance(value, (int, float)):
        return pd.Series(bool(value), index=ctx.prices.index)
    raise DSLError(f"expected boolean series, got {type(value).__name__}")


def _broadcast(a, b, ctx: _Ctx) -> tuple[pd.Series, pd.Series]:
    sa = a if isinstance(a, pd.Series) else pd.Series(a, index=ctx.prices.index)
    sb = b if isinstance(b, pd.Series) else pd.Series(b, index=ctx.prices.index)
    return sa, sb


def _eval(node: Any, ctx: _Ctx) -> Any:
    if not isinstance(node, dict) or len(node) != 1:
        raise DSLError(f"node must be a single-key dict; got {node!r}")
    op, args = next(iter(node.items()))

    if op == "all":
        if not isinstance(args, list) or not args:
            raise DSLError("'all' expects a non-empty list of conditions")
        result = _to_bool_series(_eval(args[0], ctx), ctx)
        for child in args[1:]:
            result = result & _to_bool_series(_eval(child, ctx), ctx)
        return result

    if op == "any":
        if not isinstance(args, list) or not args:
            raise DSLError("'any' expects a non-empty list of conditions")
        result = _to_bool_series(_eval(args[0], ctx), ctx)
        for child in args[1:]:
            result = result | _to_bool_series(_eval(child, ctx), ctx)
        return result

    if op == "not":
        return ~_to_bool_series(_eval(args, ctx), ctx)

    if op in {"gt", "lt", "ge", "le", "eq"}:
        if not isinstance(args, dict) or "a" not in args or "b" not in args:
            raise DSLError(f"'{op}' expects {{a, b}}")
        a = _resolve_operand(args["a"], ctx)
        b = _resolve_operand(args["b"], ctx)
        sa, sb = _broadcast(a, b, ctx)
        return {
            "gt": sa > sb,
            "lt": sa < sb,
            "ge": sa >= sb,
            "le": sa <= sb,
            "eq": sa == sb,
        }[op]

    if op == "between":
        if not isinstance(args, dict) or not {"value", "low", "high"}.issubset(args):
            raise DSLError("'between' expects {value, low, high}")
        v = _resolve_operand(args["value"], ctx)
        lo = _resolve_operand(args["low"], ctx)
        hi = _resolve_operand(args["high"], ctx)
        sv, sl = _broadcast(v, lo, ctx)
        sv, sh = _broadcast(sv, hi, ctx)
        return (sv >= sl) & (sv <= sh)

    if op == "distance_pct":
        # distance_pct: {"a": ..., "b": ..., "max": 0.03}
        if not isinstance(args, dict) or not {"a", "b", "max"}.issubset(args):
            raise DSLError("'distance_pct' expects {a, b, max}")
        a = _resolve_operand(args["a"], ctx)
        b = _resolve_operand(args["b"], ctx)
        sa, sb = _broadcast(a, b, ctx)
        with np.errstate(divide="ignore", invalid="ignore"):
            dist = (sa - sb).abs() / sb.abs()
        return (dist <= float(args["max"])).fillna(False)

    raise DSLError(f"unknown operator {op!r}")


# ─────────────────────────── public API ─────────────────────────────────


def validate(expression: dict) -> None:
    """Light structural validation. Raises ``DSLError`` on problems.

    Full validation requires evaluating against a frame; for that, call
    ``evaluate_dates`` with a small synthetic series in tests.
    """
    if not isinstance(expression, dict) or len(expression) != 1:
        raise DSLError("expression must be a single-key dict at the top")
    # Walk to surface unknown operators early.
    op, args = next(iter(expression.items()))
    if op not in {
        "all", "any", "not",
        "gt", "lt", "ge", "le", "eq",
        "between", "distance_pct",
    }:
        raise DSLError(f"unknown top-level operator {op!r}")


def evaluate_dates(expression: dict, prices: pd.DataFrame) -> list[date]:
    """Run the expression and return dates where it evaluated True."""
    validate(expression)
    if "close" not in prices.columns:
        raise DSLError("prices must include a 'close' column")
    pivots = detect_pivots(prices["close"], sensitivity=PIVOT_SENSITIVITY_INTERMEDIATE)
    devw2 = find_developing_wave_2(pivots)
    ctx = _Ctx(
        prices=prices,
        pivots=pivots,
        developing_w2=devw2,
        timeframe_sensitivity=PIVOT_SENSITIVITY_INTERMEDIATE,
    )
    series = _to_bool_series(_eval(expression, ctx), ctx)
    out: list[date] = []
    for ts, val in series.items():
        if bool(val):
            out.append(ts.date() if hasattr(ts, "date") else ts)
    return out
