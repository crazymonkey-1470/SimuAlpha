"""Freqtrade integration — library mode (Approach A).

Builds a freqtrade ``IStrategy`` subclass dynamically from a
``StrategySpec`` and wires it into freqtrade's in-process
``Backtesting`` engine with an in-process data provider that reads
from our qlib binary store.

We deliberately depend on freqtrade internals, which vary across
minor releases. The pin is ``freqtrade==2024.11`` (see
``requirements-stage4.txt``). If freqtrade is upgraded, re-read the
version's release notes for the three surface areas we touch:

- ``freqtrade.strategy.interface.IStrategy`` (entry / exit / dca /
  stop hooks).
- ``freqtrade.optimize.backtesting.Backtesting`` (instantiation +
  ``start()`` signature).
- ``freqtrade.data.dataprovider.DataProvider`` (``ohlcv`` /
  ``historic_ohlcv``).

CONVENTIONS:
- ``freqtrade`` is imported lazily inside the functions below — never
  at module load. Keeps the module importable in the ``quant-api``
  service that doesn't install Stage-4 extras.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable

import pandas as pd

from simualpha_quant.execution.price_rules import (
    ResolveContext,
    UnresolvablePriceRule,
    resolve,
)
from simualpha_quant.logging_config import get_logger
from simualpha_quant.research import universes
from simualpha_quant.research.qlib_adapter import load_prices
from simualpha_quant.research.waves import (
    detect_pivots,
    sensitivity_for_timeframe,
)
from simualpha_quant.schemas.strategy import StrategySpec

log = get_logger(__name__)

PAIR_QUOTE = "USD"
TIMEFRAME = "1d"


# ─────────────────────────── config builder ────────────────────────────


def _ticker_to_pair(ticker: str) -> str:
    return f"{ticker.upper()}/{PAIR_QUOTE}"


def _pair_to_ticker(pair: str) -> str:
    return pair.split("/", 1)[0].upper()


def build_config(spec: StrategySpec) -> dict[str, Any]:
    """Equity-realistic freqtrade config dict (in-memory; no JSON on disk)."""
    tickers = universes.resolve(spec.universe_spec)
    pairs = [_ticker_to_pair(t) for t in tickers]
    return {
        "runmode": "backtest",
        "exchange": {
            "name": "custom",
            "pair_whitelist": pairs,
            "pair_blacklist": [],
        },
        "stake_currency": PAIR_QUOTE,
        "stake_amount": "unlimited",
        "dry_run": True,
        "dry_run_wallet": spec.initial_capital,
        "fee": 0.0,  # commission-free equity defaults; override per-broker
        "tradable_balance_ratio": 1.0,
        "max_open_trades": spec.max_open_positions,
        "timeframe": TIMEFRAME,
        "timerange": f"{spec.date_range.start:%Y%m%d}-{spec.date_range.end:%Y%m%d}",
        "pairlists": [{"method": "StaticPairList"}],
        "trading_mode": "spot",
        "margin_mode": "",
        "process_only_new_candles": True,
        "position_adjustment_enable": True,
        "strategy_path": "",
    }


# ─────────────────────────── data provider ─────────────────────────────


@dataclass
class EquityOHLCStore:
    """In-process OHLCV store that sits under the dynamic data provider.

    Tests can inject a ``custom_loader`` that returns per-ticker
    DataFrames without touching the qlib binary layer. Production
    leaves ``custom_loader`` unset so ``research.qlib_adapter.load_prices``
    is used.
    """
    qlib_root: Path | str | None = None
    custom_loader: Callable[[str, date, date], pd.DataFrame] | None = None

    def load(self, ticker: str, start: date, end: date) -> pd.DataFrame:
        if self.custom_loader is not None:
            return self.custom_loader(ticker, start, end)
        return load_prices(self.qlib_root, ticker, start, end)


def make_data_provider(
    config: dict[str, Any],
    store: EquityOHLCStore,
    date_range_start: date,
    date_range_end: date,
):
    """Return a freqtrade DataProvider-shaped object backed by ``store``.

    Lazy-imports freqtrade. The returned object implements the narrow
    subset of the DataProvider API that ``Backtesting`` uses during a
    backtest run:

    - ``historic_ohlcv(pair, timeframe)`` — full series.
    - ``ohlcv(pair, timeframe, copy=False)`` — alias to historic for
      backtest mode.
    - ``market(pair)`` — dict with ``base`` / ``quote`` / ``precision``.
    """
    from freqtrade.data.dataprovider import DataProvider as _FTDataProvider  # noqa: F401

    class _Provider:
        def __init__(self):
            self._cache: dict[str, pd.DataFrame] = {}
            self.config = config

        def _load(self, pair: str) -> pd.DataFrame:
            if pair in self._cache:
                return self._cache[pair]
            ticker = _pair_to_ticker(pair)
            df = store.load(ticker, date_range_start, date_range_end)
            if df.empty:
                self._cache[pair] = df
                return df
            # freqtrade expects columns: date, open, high, low, close, volume.
            out = df.reset_index().rename(columns={"date": "date"})
            out = out[["date", "open", "high", "low", "close", "volume"]]
            out["date"] = pd.to_datetime(out["date"], utc=True)
            self._cache[pair] = out.reset_index(drop=True)
            return self._cache[pair]

        def historic_ohlcv(self, pair: str, timeframe: str = TIMEFRAME) -> pd.DataFrame:  # noqa: ARG002
            return self._load(pair).copy()

        def ohlcv(self, pair: str, timeframe: str = TIMEFRAME, copy: bool = False) -> pd.DataFrame:  # noqa: ARG002
            df = self._load(pair)
            return df.copy() if copy else df

        def market(self, pair: str) -> dict:
            return {"base": _pair_to_ticker(pair), "quote": PAIR_QUOTE, "precision": {"price": 2}}

    return _Provider()


# ─────────────────────────── dynamic strategy factory ──────────────────


def build_strategy_class(spec: StrategySpec, *, runtime_state: dict | None = None):
    """Return a freshly-constructed freqtrade ``IStrategy`` subclass
    bound to ``spec``.

    ``runtime_state`` is an optional mutable dict the engine uses to
    pass per-ticker context (pivots, signal dates) into the strategy's
    hot-path callbacks without shoving it onto the strategy instance.
    """
    from freqtrade.strategy import IStrategy  # lazy import

    state = runtime_state if runtime_state is not None else {}

    planned_total_per_pair = _planned_total_per_pair(spec)

    class _TLIStrategy(IStrategy):
        INTERFACE_VERSION = 3
        timeframe = TIMEFRAME
        stoploss = -0.99  # placeholder; real stop handled in custom_stoploss
        trailing_stop = False
        process_only_new_candles = True
        use_exit_signal = True
        exit_profit_only = False
        startup_candle_count = 220  # warm-up for 200 SMA + some slack
        can_short = False
        position_adjustment_enable = True
        max_entry_position_adjustment = len(spec.entry.tranches) - 1

        # ── hot-path helpers ──

        def _ctx(self, pair: str, dataframe: pd.DataFrame, current_idx: int, signal_idx: int) -> ResolveContext:
            ticker = _pair_to_ticker(pair)
            pivots = state.get(f"pivots:{ticker}")
            if pivots is None:
                sensitivity = sensitivity_for_timeframe("intermediate")
                pivots = detect_pivots(dataframe["close"], sensitivity=sensitivity)
                state[f"pivots:{ticker}"] = pivots
            return ResolveContext(
                prices=dataframe,
                current_index=current_idx,
                signal_index=signal_idx,
                pivots=pivots,
            )

        # ── entry ──

        def populate_indicators(self, dataframe: pd.DataFrame, metadata: dict) -> pd.DataFrame:
            # The detector/DSL path is delegated to research/ already —
            # we just memoize the bool entry column here.
            pair = metadata["pair"]
            ticker = _pair_to_ticker(pair)
            enter_col = state.get(f"enter:{ticker}")
            if enter_col is None or len(enter_col) != len(dataframe):
                enter_col = _compute_entry_signal(spec, dataframe)
                state[f"enter:{ticker}"] = enter_col
            dataframe = dataframe.copy()
            dataframe["tli_enter"] = enter_col
            return dataframe

        def populate_entry_trend(self, dataframe: pd.DataFrame, metadata: dict) -> pd.DataFrame:  # noqa: ARG002
            dataframe["enter_long"] = dataframe["tli_enter"].astype(int)
            return dataframe

        def populate_exit_trend(self, dataframe: pd.DataFrame, metadata: dict) -> pd.DataFrame:  # noqa: ARG002
            # All exits happen via custom_exit / custom_stoploss /
            # adjust_trade_position. Leaving populate_exit_trend inert.
            dataframe["exit_long"] = 0
            return dataframe

        # ── tranches (DCA ladder) ──

        def adjust_trade_position(
            self, trade, current_time, current_rate, current_profit,
            min_stake, max_stake, **_kwargs,
        ):
            entries_so_far = int(getattr(trade, "nr_of_successful_entries", 1))
            if entries_so_far >= len(spec.entry.tranches):
                return None
            next_tranche = spec.entry.tranches[entries_so_far]
            dataframe = self.dp.ohlcv(pair=trade.pair, timeframe=self.timeframe)
            if dataframe is None or dataframe.empty:
                return None
            try:
                current_idx = int(dataframe.index[dataframe["date"] <= current_time].max())
                signal_idx = int(getattr(trade, "open_trade_index", current_idx))
            except Exception:
                return None
            ctx = self._ctx(trade.pair, dataframe, current_idx, signal_idx)
            try:
                trigger_price = resolve(next_tranche.price_rule, ctx)
            except UnresolvablePriceRule:
                return None
            if current_rate > trigger_price * 1.005:
                # Too far above the trigger — wait.
                return None
            stake = next_tranche.pct_of_position * planned_total_per_pair
            stake = max(min_stake or 0.0, min(stake, max_stake))
            return stake

        # ── take-profit (spec order) ──

        def custom_exit(
            self, pair, trade, current_time, current_rate, current_profit, **_kwargs,
        ):
            dataframe = self.dp.ohlcv(pair=pair, timeframe=self.timeframe)
            if dataframe is None or dataframe.empty:
                return None
            try:
                current_idx = int(dataframe.index[dataframe["date"] <= current_time].max())
                signal_idx = int(getattr(trade, "open_trade_index", current_idx))
            except Exception:
                return None
            ctx = self._ctx(pair, dataframe, current_idx, signal_idx)
            for i, leg in enumerate(spec.exit.take_profit):
                try:
                    price = resolve(leg.price_rule, ctx)
                except UnresolvablePriceRule:
                    continue
                if current_rate >= price:
                    return f"tp_leg_{i}"
            if spec.exit.time_stop_days is not None:
                if (current_time.date() - trade.open_date_utc.date()).days >= spec.exit.time_stop_days:
                    return "time_stop"
            return None

        # ── stop-loss ──

        def custom_stoploss(
            self, pair, trade, current_time, current_rate, current_profit, **_kwargs,
        ):
            dataframe = self.dp.ohlcv(pair=pair, timeframe=self.timeframe)
            if dataframe is None or dataframe.empty:
                return -0.15
            try:
                current_idx = int(dataframe.index[dataframe["date"] <= current_time].max())
                signal_idx = int(getattr(trade, "open_trade_index", current_idx))
            except Exception:
                return -0.15
            ctx = self._ctx(pair, dataframe, current_idx, signal_idx)
            try:
                trigger = resolve(spec.exit.stop_loss.price_rule, ctx)
            except UnresolvablePriceRule:
                return -0.15
            entry = trade.open_rate or current_rate
            if entry <= 0:
                return -0.15
            stop_pct = (trigger / entry) - 1.0
            if spec.exit.stop_loss.type == "trailing":
                high_water = float(getattr(trade, "max_rate", entry))
                # trailing = keep stop at fixed % below peak
                trailing_pct = (trigger / high_water) - 1.0
                return max(stop_pct, trailing_pct)
            return stop_pct

    _TLIStrategy.__name__ = "TLIStrategy"
    _TLIStrategy.__qualname__ = "TLIStrategy"
    return _TLIStrategy


# ─────────────────────────── sizing math ──────────────────────────────


def _planned_total_per_pair(spec: StrategySpec) -> float:
    """Compute the per-position planned-total USD stake.

    For ``fixed`` sizing, this is ``params.stake_usd``. For the other
    methods we approximate with a naive initial_capital / max_open_positions;
    the full math lives in ``simulate.py``.
    """
    method = spec.position_sizing.method
    params = spec.position_sizing.params
    if method == "fixed":
        return float(params["stake_usd"])
    return float(spec.initial_capital) / float(spec.max_open_positions)


# ─────────────────────────── entry-signal compute ─────────────────────


def _compute_entry_signal(spec: StrategySpec, dataframe: pd.DataFrame) -> pd.Series:
    """Translate spec.entry into a per-bar boolean entry column."""
    # Translate freqtrade's date column back to DatetimeIndex the
    # detectors expect.
    df = dataframe.copy()
    if "date" in df.columns:
        df = df.set_index(pd.to_datetime(df["date"]))
        df = df.drop(columns=["date"])

    if spec.entry.pattern_name is not None:
        from simualpha_quant.research.patterns import by_name
        detector = by_name(spec.entry.pattern_name)
        dates = detector.detect(df)
    else:
        from simualpha_quant.research import custom_expression
        dates = custom_expression.evaluate_dates(spec.entry.custom_expression or {}, df)

    signal_set = {pd.Timestamp(d).normalize() for d in dates}
    idx = pd.DatetimeIndex(df.index).normalize()
    return pd.Series(idx.isin(signal_set), index=dataframe.index, dtype=bool)
