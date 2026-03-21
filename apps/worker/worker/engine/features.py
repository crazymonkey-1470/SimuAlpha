"""Feature engineering pipeline for SimuAlpha.

Transforms raw OHLCV DataFrames into MarketState objects.
Every feature is documented: what it measures, how it is computed,
and where it is used in the simulation engine.

CRITICAL: No future data leakage. For any date T, features use only
data available on or before T.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from worker.core.logging import get_logger
from worker.engine.market_state import MarketSnapshot, MarketState, VolatilityRegime

log = get_logger("engine.features")

# Instruments expected for a full snapshot
DEFAULT_INSTRUMENTS = ["SPY", "QQQ", "TLT", "VIX", "NVDA"]

# Lookback windows (trading days)
VOL_WINDOW = 20
VOLUME_WINDOW = 20
MOMENTUM_FAST = 5
MOMENTUM_SLOW = 20


def build_market_states(
    data: dict[str, pd.DataFrame],
    target_date: str | pd.Timestamp | None = None,
) -> dict[str, pd.DataFrame]:
    """Build feature DataFrames for all instruments.

    Returns dict of {symbol: DataFrame} where each DataFrame has one row
    per trading day with all MarketState features as columns.

    If target_date is given, returns features only up to and including
    that date (no future leakage).
    """
    result: dict[str, pd.DataFrame] = {}
    for symbol, df in data.items():
        features = compute_features(df, symbol)
        if target_date is not None:
            features = features.loc[:pd.Timestamp(target_date)]
        result[symbol] = features
    return result


def compute_features(df: pd.DataFrame, symbol: str) -> pd.DataFrame:
    """Compute all MarketState features from raw OHLCV for a single instrument.

    Input: DataFrame with DatetimeIndex and columns [open, high, low, close, volume].
    Output: DataFrame with same index and all feature columns.
    """
    if df.empty or "close" not in df.columns:
        return pd.DataFrame()

    out = pd.DataFrame(index=df.index)
    close = df["close"]
    volume = df.get("volume", pd.Series(0, index=df.index))
    high = df.get("high", close)
    low = df.get("low", close)

    # ── Price ────────────────────────────────────────────────────────────
    # What: closing price
    # Used: cross-asset context, scenario thresholds
    out["price"] = close

    # ── Returns ──────────────────────────────────────────────────────────
    # What: simple returns over 1, 5, 20 day horizons
    # How: pct_change on close prices
    # Used: all actors, regime engine, signal engine
    out["return_1d"] = close.pct_change(1)
    out["return_5d"] = close.pct_change(5)
    out["return_20d"] = close.pct_change(20)

    # ── Realized volatility ──────────────────────────────────────────────
    # What: annualized standard deviation of daily returns over 20-day window
    # How: rolling std of daily returns × sqrt(252)
    # Used: vol regime classification, trend follower penalty, mean reversion scaling
    daily_returns = close.pct_change(1)
    out["realized_vol"] = daily_returns.rolling(VOL_WINDOW).std() * math.sqrt(252)

    # ── Volume z-score ───────────────────────────────────────────────────
    # What: current volume relative to 20-day average, standardized
    # How: (volume - rolling_mean) / rolling_std
    # Used: mean reversion agent (capitulation detection)
    vol_mean = volume.rolling(VOLUME_WINDOW).mean()
    vol_std = volume.rolling(VOLUME_WINDOW).std()
    out["volume_zscore"] = ((volume - vol_mean) / vol_std.replace(0, np.nan)).fillna(0)

    # ── Momentum score ───────────────────────────────────────────────────
    # What: composite momentum signal from -1 (strong downward) to +1 (strong upward)
    # How: blend of rate-of-change percentile rank (5d + 20d)
    # Used: trend follower, regime engine
    roc_5 = close.pct_change(MOMENTUM_FAST)
    roc_20 = close.pct_change(MOMENTUM_SLOW)
    # Rank within a 60-day window, scale to [-1, 1]
    rank_5 = roc_5.rolling(60).rank(pct=True).fillna(0.5) * 2 - 1
    rank_20 = roc_20.rolling(60).rank(pct=True).fillna(0.5) * 2 - 1
    out["momentum_score"] = (0.4 * rank_5 + 0.6 * rank_20).clip(-1, 1)

    # ── Mean reversion score ─────────────────────────────────────────────
    # What: how stretched the price is vs recent vol (+1 = oversold, -1 = overbought)
    # How: negative z-score of 5-day return relative to 20-day vol
    # Used: mean reversion agent
    vol_5d = out["realized_vol"] / math.sqrt(252) * math.sqrt(5)  # 5-day vol
    stretch = out["return_5d"] / vol_5d.replace(0, np.nan)
    out["mean_reversion_score"] = (-stretch * 0.3).clip(-1, 1).fillna(0)

    # ── Trend strength ───────────────────────────────────────────────────
    # What: directional strength from -1 (strong downtrend) to +1 (strong uptrend)
    # How: blend of 20-day return direction, momentum, and 5-day direction
    # Used: trend follower, regime engine, signal engine
    sign_20 = np.sign(out["return_20d"]) * (out["return_20d"].abs() / 0.05).clip(0, 1)
    sign_5 = np.sign(out["return_5d"]) * (out["return_5d"].abs() / 0.03).clip(0, 1)
    out["trend_strength"] = (0.5 * sign_20 + 0.3 * out["momentum_score"] + 0.2 * sign_5).clip(-1, 1)

    # ── Yield change proxy ───────────────────────────────────────────────
    # What: change in bond yields, approximated from TLT returns
    # How: for TLT, use its own 1d return inverted and scaled to bps
    #      for other instruments, this gets filled from TLT in the snapshot builder
    # Used: macro news agent
    if symbol == "TLT":
        # TLT falls when yields rise. ~0.15 duration → 1% TLT move ≈ ~6.7bp yield change
        out["yield_change_proxy"] = -out["return_1d"] * 670  # bps
    else:
        out["yield_change_proxy"] = 0.0  # filled from TLT in snapshot builder

    # ── Volatility regime ────────────────────────────────────────────────
    # What: categorical classification of realized vol level
    # How: compare realized vol to 1-year rolling median
    # Used: all actors, regime engine
    vol_median = out["realized_vol"].rolling(252, min_periods=60).median()
    vol_ratio = out["realized_vol"] / vol_median.replace(0, np.nan)
    out["vol_regime_ratio"] = vol_ratio.fillna(1.0)

    # ── Gap risk ─────────────────────────────────────────────────────────
    # What: proxy for overnight gap risk, 0 to 1
    # How: blend of vol regime elevation + absolute daily return percentile
    # Used: dealer proxy agent
    daily_return_pctrank = daily_returns.abs().rolling(60).rank(pct=True).fillna(0.5)
    out["gap_risk"] = (
        0.5 * (vol_ratio.fillna(1.0) - 0.7).clip(0, 1)
        + 0.5 * daily_return_pctrank
    ).clip(0, 1)

    # ── Breadth proxy ────────────────────────────────────────────────────
    # What: heuristic for market breadth from -1 (broad decline) to +1 (broad advance)
    # How: compare SPY 5d return to rolling percentile. True breadth requires
    #      advance/decline data which is not in OHLCV.
    # Used: regime engine
    ret_5d_rank = out["return_5d"].rolling(60).rank(pct=True).fillna(0.5)
    out["breadth_proxy"] = (ret_5d_rank * 2 - 1).clip(-1, 1)

    # ── Sentiment proxy ──────────────────────────────────────────────────
    # What: heuristic sentiment from -1 (extreme fear) to +1 (extreme greed)
    # How: blend of momentum rank and inverse vol rank. True sentiment
    #      requires survey/positioning data.
    # Used: macro news agent (contrarian at extremes)
    inv_vol_rank = (1 - out["realized_vol"].rolling(60).rank(pct=True).fillna(0.5))
    out["sentiment_score"] = (0.5 * rank_20 + 0.5 * (inv_vol_rank * 2 - 1)).clip(-1, 1)

    # ── Dealer support proxy ─────────────────────────────────────────────
    # What: heuristic for dealer gamma positioning from -1 to +1
    # How: when vol is low and market is near highs → positive gamma (stabilizing)
    #      when vol is expanding and market falling → negative gamma (destabilizing)
    #      True dealer gamma requires options OI data.
    # Used: dealer proxy agent, regime engine
    near_high = (close / close.rolling(20).max()).fillna(1.0)
    vol_pressure = -(vol_ratio.fillna(1.0) - 1.0).clip(-0.5, 0.5)
    out["dealer_support_proxy"] = (0.5 * (near_high * 2 - 1) + 0.5 * vol_pressure).clip(-1, 1)

    # ── Macro event risk proxy ───────────────────────────────────────────
    # What: heuristic for near-term macro event risk, 0 to 1
    # How: blend of vol-of-vol (unstable vol = upcoming events) and gap risk
    #      True event risk requires an economic calendar feed.
    # Used: macro news agent, scenario engine
    vol_of_vol = daily_returns.rolling(5).std().rolling(20).rank(pct=True).fillna(0.5)
    out["macro_event_risk"] = (0.6 * vol_of_vol + 0.4 * out["gap_risk"]).clip(0, 1)

    return out


def build_snapshot_for_date(
    feature_data: dict[str, pd.DataFrame],
    target_date: str | pd.Timestamp,
) -> MarketSnapshot | None:
    """Build a MarketSnapshot for a specific date from pre-computed features.

    Returns None if the target date is not a trading day in the data.
    """
    target_ts = pd.Timestamp(target_date)
    ts = datetime(target_ts.year, target_ts.month, target_ts.day, 16, 30, tzinfo=timezone.utc)

    states: dict[str, MarketState] = {}
    tlt_yield_change = 0.0

    # Get TLT yield change first for cross-filling
    if "TLT" in feature_data:
        tlt_df = feature_data["TLT"]
        if target_ts in tlt_df.index:
            row = tlt_df.loc[target_ts]
            tlt_yield_change = float(row.get("yield_change_proxy", 0.0))

    for symbol, df in feature_data.items():
        if target_ts not in df.index:
            continue
        row = df.loc[target_ts]
        if pd.isna(row.get("return_1d")):
            continue

        state = _row_to_market_state(row, symbol, ts, tlt_yield_change)
        if state is not None:
            states[symbol] = state

    if "SPY" not in states:
        return None

    return MarketSnapshot(timestamp=ts, states=states)


def _row_to_market_state(
    row: pd.Series,
    symbol: str,
    ts: datetime,
    tlt_yield_change: float,
) -> MarketState | None:
    """Convert a feature row into a MarketState object."""
    try:
        # Classify vol regime from ratio
        vol_ratio = float(row.get("vol_regime_ratio", 1.0))
        if vol_ratio < 0.7:
            vol_regime = VolatilityRegime.COMPRESSED
        elif vol_ratio < 1.2:
            vol_regime = VolatilityRegime.NORMAL
        elif vol_ratio < 1.8:
            vol_regime = VolatilityRegime.ELEVATED
        else:
            vol_regime = VolatilityRegime.EXTREME

        # Use TLT yield change for non-TLT instruments
        yield_change = float(row.get("yield_change_proxy", 0.0))
        if symbol != "TLT" and tlt_yield_change != 0.0:
            yield_change = tlt_yield_change

        return MarketState(
            timestamp=ts,
            instrument=symbol,
            price=round(_safe(row, "price", 0.0), 2),
            return_1d=round(_safe(row, "return_1d", 0.0), 5),
            return_5d=round(_safe(row, "return_5d", 0.0), 5),
            return_20d=round(_safe(row, "return_20d", 0.0), 5),
            realized_vol=round(max(0.01, _safe(row, "realized_vol", 0.15)), 4),
            volume_zscore=round(_safe(row, "volume_zscore", 0.0), 2),
            breadth_proxy=round(_clamp(_safe(row, "breadth_proxy", 0.0), -1, 1), 2),
            momentum_score=round(_clamp(_safe(row, "momentum_score", 0.0), -1, 1), 3),
            mean_reversion_score=round(_clamp(_safe(row, "mean_reversion_score", 0.0), -1, 1), 3),
            yield_change_proxy=round(yield_change, 1),
            volatility_regime=vol_regime,
            macro_event_risk=round(_clamp(_safe(row, "macro_event_risk", 0.25), 0, 1), 2),
            sentiment_score=round(_clamp(_safe(row, "sentiment_score", 0.0), -1, 1), 2),
            trend_strength=round(_clamp(_safe(row, "trend_strength", 0.0), -1, 1), 3),
            gap_risk=round(_clamp(_safe(row, "gap_risk", 0.1), 0, 1), 2),
            dealer_support_proxy=round(_clamp(_safe(row, "dealer_support_proxy", 0.0), -1, 1), 2),
        )
    except Exception as exc:
        log.warning("Failed to build MarketState for %s: %s", symbol, exc)
        return None


def _safe(row: pd.Series, key: str, default: float) -> float:
    val = row.get(key, default)
    if pd.isna(val):
        return default
    return float(val)


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))
