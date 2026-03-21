"""First-pass calibration and validation framework for SimuAlpha.

Evaluates simulation outputs against realized market outcomes.
This is NOT a full optimization system — it is a credible first-pass
evaluation that answers: "Are SimuAlpha's outputs directionally plausible?"

Metrics computed:
- Forward returns by signal bias class (1d, 5d, 20d)
- Realized vol by regime label
- Regime transition frequency
- Signal directional hit rate
- Scenario base-case accuracy
- Drawdown behavior under "fragile" regimes
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from worker.core.logging import get_logger
from worker.schemas.replay import ReplayFrame

log = get_logger("engine.calibration")


# ── Benchmark historical periods ─────────────────────────────────────────────
# Each tuple: (name, start_date, end_date, expected_dominant_regime, description)
BENCHMARK_PERIODS: list[dict] = [
    {
        "name": "covid_crash",
        "start": "2020-02-19",
        "end": "2020-03-23",
        "expected_regimes": ["trend_down", "macro_risk_off"],
        "description": "COVID-19 crash: fastest 30% drawdown in SPX history",
    },
    {
        "name": "post_covid_rally",
        "start": "2020-04-01",
        "end": "2020-08-31",
        "expected_regimes": ["trend_up", "macro_risk_on", "unstable_rally"],
        "description": "Post-COVID V-shaped recovery fueled by stimulus",
    },
    {
        "name": "2022_bear",
        "start": "2022-01-03",
        "end": "2022-06-30",
        "expected_regimes": ["trend_down", "macro_risk_off"],
        "description": "2022 rate-hike bear market: Fed tightening drove equities lower",
    },
    {
        "name": "2023_ai_rally",
        "start": "2023-01-03",
        "end": "2023-07-31",
        "expected_regimes": ["trend_up", "fragile_uptrend"],
        "description": "2023 AI-driven rally with narrow breadth (Magnificent 7)",
    },
    {
        "name": "2024_chop",
        "start": "2024-04-01",
        "end": "2024-06-30",
        "expected_regimes": ["chop", "squeeze", "fragile_uptrend"],
        "description": "Mid-2024 consolidation period with mixed signals",
    },
    {
        "name": "aug_2024_vix_spike",
        "start": "2024-07-15",
        "end": "2024-08-15",
        "expected_regimes": ["macro_risk_off", "unstable_rally"],
        "description": "Aug 2024 yen carry unwind and VIX spike to 65",
    },
]


@dataclass
class CalibrationResult:
    """Container for calibration metrics."""

    period_name: str
    start_date: str
    end_date: str
    total_frames: int = 0

    # Regime metrics
    regime_counts: dict[str, int] = field(default_factory=dict)
    regime_transitions: int = 0
    expected_regimes: list[str] = field(default_factory=list)
    regime_match_rate: float = 0.0  # fraction of days in expected regimes

    # Signal metrics
    signal_bias_counts: dict[str, int] = field(default_factory=dict)
    signal_returns: dict[str, dict[str, float]] = field(default_factory=dict)
    # e.g. {"bullish": {"1d_mean": 0.002, "5d_mean": 0.01, ...}}

    # Volatility by regime
    vol_by_regime: dict[str, float] = field(default_factory=dict)

    # Drawdown under fragile regimes
    max_drawdown: float = 0.0
    fragile_regime_max_dd: float = 0.0

    # Scenario accuracy
    base_case_direction_accuracy: float = 0.0

    # Summary
    summary: str = ""


def evaluate_replay_frames(
    frames: list[ReplayFrame],
    spy_data: pd.DataFrame,
    period_name: str = "unnamed",
    expected_regimes: list[str] | None = None,
) -> CalibrationResult:
    """Evaluate a sequence of replay frames against realized outcomes.

    Parameters
    ----------
    frames : list of ReplayFrame from replay engine
    spy_data : raw SPY OHLCV DataFrame for computing forward returns
    period_name : label for this evaluation window
    expected_regimes : which regimes we'd expect to dominate this period
    """
    result = CalibrationResult(
        period_name=period_name,
        start_date=frames[0].date if frames else "",
        end_date=frames[-1].date if frames else "",
        total_frames=len(frames),
        expected_regimes=expected_regimes or [],
    )

    if not frames or spy_data.empty:
        result.summary = "Insufficient data for evaluation"
        return result

    close = spy_data["close"]

    # ── Regime metrics ───────────────────────────────────────────────────
    regimes = [f.regime for f in frames]
    regime_counts: dict[str, int] = {}
    for r in regimes:
        regime_counts[r] = regime_counts.get(r, 0) + 1
    result.regime_counts = regime_counts

    # Transition count
    transitions = sum(1 for i in range(1, len(regimes)) if regimes[i] != regimes[i - 1])
    result.regime_transitions = transitions

    # Match rate vs expected
    if expected_regimes:
        matched = sum(1 for r in regimes if r in expected_regimes)
        result.regime_match_rate = matched / len(regimes) if regimes else 0.0

    # ── Signal metrics ───────────────────────────────────────────────────
    signal_bias_counts: dict[str, int] = {}
    signal_returns: dict[str, list[dict[str, float]]] = {}

    for frame in frames:
        # Infer signal bias from the frame notes
        bias = _extract_signal_bias(frame)
        signal_bias_counts[bias] = signal_bias_counts.get(bias, 0) + 1

        # Forward returns
        ts = pd.Timestamp(frame.date)
        if ts in close.index:
            base_price = close.loc[ts]
            fwd = {}
            for horizon, label in [(1, "1d"), (5, "5d"), (20, "20d")]:
                future = close.loc[ts:]
                if len(future) > horizon:
                    fwd[label] = (future.iloc[horizon] - base_price) / base_price
            if fwd:
                signal_returns.setdefault(bias, []).append(fwd)

    result.signal_bias_counts = signal_bias_counts

    # Aggregate signal returns
    agg_returns: dict[str, dict[str, float]] = {}
    for bias, returns_list in signal_returns.items():
        agg: dict[str, float] = {}
        for horizon in ["1d", "5d", "20d"]:
            vals = [r[horizon] for r in returns_list if horizon in r]
            if vals:
                agg[f"{horizon}_mean"] = float(np.mean(vals))
                agg[f"{horizon}_median"] = float(np.median(vals))
                agg[f"{horizon}_count"] = len(vals)
        agg_returns[bias] = agg
    result.signal_returns = agg_returns

    # ── Vol by regime ────────────────────────────────────────────────────
    vol_by_regime: dict[str, list[float]] = {}
    for frame in frames:
        ts = pd.Timestamp(frame.date)
        # Use realized vol from SPY data
        daily_returns = close.pct_change()
        if ts in daily_returns.index:
            loc = daily_returns.index.get_loc(ts)
            if loc >= 20:
                window = daily_returns.iloc[loc - 19:loc + 1]
                rvol = float(window.std() * np.sqrt(252))
                vol_by_regime.setdefault(frame.regime, []).append(rvol)

    result.vol_by_regime = {k: round(float(np.mean(v)), 4) for k, v in vol_by_regime.items()}

    # ── Drawdown ─────────────────────────────────────────────────────────
    period_close = close.loc[frames[0].date:frames[-1].date]
    if len(period_close) > 1:
        running_max = period_close.cummax()
        drawdown = (period_close - running_max) / running_max
        result.max_drawdown = round(float(drawdown.min()), 4)

        # Drawdown only during fragile regimes
        fragile_dates = [f.date for f in frames if "fragile" in f.regime or "unstable" in f.regime]
        if fragile_dates:
            frag_close = close.reindex([pd.Timestamp(d) for d in fragile_dates]).dropna()
            if len(frag_close) > 1:
                frag_max = frag_close.cummax()
                frag_dd = (frag_close - frag_max) / frag_max
                result.fragile_regime_max_dd = round(float(frag_dd.min()), 4)

    # ── Base case direction accuracy ─────────────────────────────────────
    correct = 0
    total = 0
    for frame in frames:
        base = next((s for s in frame.scenario_branches if "base" in s.id), None)
        if base is None:
            continue
        ts = pd.Timestamp(frame.date)
        if ts not in close.index:
            continue
        future = close.loc[ts:]
        if len(future) <= 5:
            continue

        fwd_5d = (future.iloc[5] - future.iloc[0]) / future.iloc[0]
        predicted_dir = 1 if "bullish" in base.direction else (-1 if "bearish" in base.direction else 0)
        realized_dir = 1 if fwd_5d > 0.002 else (-1 if fwd_5d < -0.002 else 0)

        total += 1
        if predicted_dir == realized_dir or predicted_dir == 0:
            correct += 1

    result.base_case_direction_accuracy = round(correct / total, 3) if total > 0 else 0.0

    # ── Summary ──────────────────────────────────────────────────────────
    dominant = max(regime_counts, key=regime_counts.get) if regime_counts else "unknown"
    result.summary = (
        f"Period '{period_name}': {len(frames)} frames. "
        f"Dominant regime: {dominant} ({regime_counts.get(dominant, 0)}/{len(frames)}). "
        f"Regime match rate: {result.regime_match_rate:.0%}. "
        f"Transitions: {transitions}. "
        f"Max DD: {result.max_drawdown:.2%}. "
        f"Base-case directional accuracy: {result.base_case_direction_accuracy:.0%}."
    )

    return result


def _extract_signal_bias(frame: ReplayFrame) -> str:
    """Extract signal bias from frame notes."""
    notes = frame.notes.lower()
    if "signal=bullish" in notes or "signal=mildly bullish" in notes:
        return "bullish"
    elif "signal=bearish" in notes or "signal=mildly bearish" in notes:
        return "bearish"
    return "neutral"


def format_calibration_report(results: list[CalibrationResult]) -> str:
    """Format calibration results into a readable report."""
    lines: list[str] = []
    lines.append("=" * 80)
    lines.append("SimuAlpha Calibration Report")
    lines.append("=" * 80)

    for r in results:
        lines.append("")
        lines.append(f"── {r.period_name} ({r.start_date} to {r.end_date}) ──")
        lines.append(f"  Frames: {r.total_frames}")
        lines.append(f"  Regime distribution: {r.regime_counts}")
        lines.append(f"  Expected regimes: {r.expected_regimes}")
        lines.append(f"  Regime match rate: {r.regime_match_rate:.0%}")
        lines.append(f"  Regime transitions: {r.regime_transitions}")
        lines.append(f"  Max drawdown: {r.max_drawdown:.2%}")
        if r.fragile_regime_max_dd:
            lines.append(f"  Fragile-regime drawdown: {r.fragile_regime_max_dd:.2%}")
        lines.append(f"  Base-case direction accuracy: {r.base_case_direction_accuracy:.0%}")

        if r.vol_by_regime:
            lines.append(f"  Realized vol by regime:")
            for regime, vol in sorted(r.vol_by_regime.items()):
                lines.append(f"    {regime}: {vol:.1%}")

        if r.signal_returns:
            lines.append(f"  Forward returns by signal bias:")
            for bias, rets in sorted(r.signal_returns.items()):
                parts = [f"{k}={v:+.3%}" for k, v in rets.items() if "mean" in k]
                lines.append(f"    {bias}: {', '.join(parts)}")

        lines.append(f"  Summary: {r.summary}")

    lines.append("")
    lines.append("=" * 80)
    lines.append("NOTE: This is a first-pass evaluation. Heuristic proxies are used for")
    lines.append("breadth, sentiment, dealer gamma, and macro event risk. True calibration")
    lines.append("requires production data feeds for these signals.")
    lines.append("=" * 80)

    return "\n".join(lines)
