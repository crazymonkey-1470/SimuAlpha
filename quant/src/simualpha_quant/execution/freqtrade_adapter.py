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

from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable, Iterator

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

# Every dynamically-built IStrategy subclass registers under this
# name with freqtrade's resolver. freqtrade 2026.3's Backtesting
# init REQUIRES config["strategy"] to be a string; the
# ``register_dynamic_strategy`` context manager below patches
# StrategyResolver._load_strategy so lookups of this name return
# our closure class instead of doing filesystem discovery.
STRATEGY_NAME = "TLIStrategy"


# ─────────────────────────── config builder ────────────────────────────


def _ticker_to_pair(ticker: str) -> str:
    return f"{ticker.upper()}/{PAIR_QUOTE}"


def _pair_to_ticker(pair: str) -> str:
    return pair.split("/", 1)[0].upper()


# Freqtrade's ExchangeResolver demands a ccxt-known exchange name
# during Backtesting.__init__. There's no "equities" option, so we
# impersonate a lightweight spot exchange. `binance` is the community
# default for equity backtests in freqtrade because it's supported by
# every ccxt version and has permissive precision defaults. dry_run +
# API-keyless config means no real connection is ever attempted.
SHIMMED_EXCHANGE = "binance"


# Freqtrade 2026.3 ``Exchange.validate_config`` demands these keys
# exist with specific shapes even in backtest mode — missing any of
# them raises ``KeyError`` deep inside exchange init. Sourced from
# ``freqtrade.config_schema.config_schema.SCHEMA_TRADE_REQUIRED``
# and runtime tracing of ``validate_config`` /
# ``validate_pricing`` / ``check_exchange``.
#
# A unit test in ``tests/execution/test_freqtrade_config.py``
# calls ``freqtrade.optimize.backtesting.Backtesting(build_config(...))``
# so any new required key surfaces at CI time, not deploy time.


def _default_pricing_block() -> dict[str, Any]:
    """Minimal pricing block freqtrade's validator accepts."""
    return {
        "price_side": "same",        # ask / bid / same / other; 'same' = safe default
        "use_order_book": False,
        "price_last_balance": 0.0,
    }


def _default_order_types_block() -> dict[str, Any]:
    return {
        "entry": "limit",
        "exit": "limit",
        "emergency_exit": "market",
        "force_entry": "market",
        "force_exit": "market",
        "stoploss": "market",
        "stoploss_on_exchange": False,
    }


def _default_order_tif_block() -> dict[str, Any]:
    return {"entry": "GTC", "exit": "GTC"}


def build_config(spec: StrategySpec) -> dict[str, Any]:
    """Equity-realistic freqtrade config dict (in-memory; no JSON on disk).

    Targets freqtrade 2026.3. If a future freqtrade release adds new
    required keys, the integration test in
    ``tests/execution/test_freqtrade_config.py`` will fail before
    production does.
    """
    tickers = universes.resolve(spec.universe_spec)
    pairs = [_ticker_to_pair(t) for t in tickers]
    return {
        "runmode": "backtest",
        # freqtrade 2026.3's Backtesting.__init__ calls
        # StrategyResolver.load_strategy(config) and requires
        # config["strategy"] to be a non-empty string. We fill in the
        # fixed TLIStrategy name and pair it with the
        # register_dynamic_strategy() context manager wrapped around
        # the Backtesting(config) call in simulate.py.
        "strategy": STRATEGY_NAME,
        "exchange": {
            "name": SHIMMED_EXCHANGE,
            "pair_whitelist": pairs,
            "pair_blacklist": [],
            "ccxt_config": {},
            "ccxt_async_config": {},
            "key": "",
            "secret": "",
        },
        "stake_currency": PAIR_QUOTE,
        "stake_amount": "unlimited",
        "tradable_balance_ratio": 1.0,
        "last_stake_amount_min_ratio": 0.5,
        "dry_run": True,
        "dry_run_wallet": spec.initial_capital,
        "fee": 0.0,
        "max_open_trades": spec.max_open_positions,
        "timeframe": TIMEFRAME,
        "timerange": f"{spec.date_range.start:%Y%m%d}-{spec.date_range.end:%Y%m%d}",
        "pairlists": [{"method": "StaticPairList"}],
        "trading_mode": "spot",
        "margin_mode": "",
        "process_only_new_candles": True,
        "position_adjustment_enable": True,
        "strategy_path": "",
        # freqtrade 2026.3 additions — previously missing, caused
        # KeyError: 'exit_pricing' at Backtesting init.
        "entry_pricing": _default_pricing_block(),
        "exit_pricing": _default_pricing_block(),
        "order_types": _default_order_types_block(),
        "order_time_in_force": _default_order_tif_block(),
        # Placeholder stop + ROI. Real logic lives in custom_stoploss /
        # custom_exit. freqtrade will ignore these as long as
        # position_adjustment_enable is True and custom_* hooks are
        # implemented on the strategy.
        "stoploss": -0.99,
        "minimal_roi": {"0": 10.0},
        # Data format — the on-disk cache shape. feather is the 2026.x
        # default and what our DataProvider returns, so this matches.
        "dataformat_ohlcv": "feather",
        "dataformat_trades": "feather",
        "internals": {},
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

    _TLIStrategy.__name__ = STRATEGY_NAME
    _TLIStrategy.__qualname__ = STRATEGY_NAME
    return _TLIStrategy


# ─────────────────────────── dynamic-strategy registration ─────────────
#
# Freqtrade 2026.3's ``Backtesting.__init__`` calls
# ``StrategyResolver.load_strategy(self.config)`` which:
#
#   1. Reads the string name from ``config["strategy"]``.
#   2. Calls ``StrategyResolver._load_strategy(strategy_name, config,
#      extra_dir=config.get("strategy_path"))``.
#   3. That in turn walks ``abs_paths`` (built from ``user_data_dir``,
#      ``strategy_path``, and recursive subdirs) and for each ``.py``
#      file text-matches ``class <strategy_name>(`` and imports the
#      module to pull the class out. It then calls ``ClassName(config=
#      config)`` to instantiate.
#
# There is NO mechanism to pass a class object directly through the
# config — every path assumes on-disk discovery. Writing our dynamic
# class out to a tempfile would lose the closure over ``spec`` and
# ``runtime_state`` that ``build_strategy_class`` sets up.
#
# The surgical fix: inside a context manager, swap in a replacement
# for ``StrategyResolver._load_strategy`` that recognizes our
# well-known name (``TLIStrategy``) and returns the instantiated
# closure class, then delegates everything else to the original
# implementation. ``load_strategy`` (the public caller) still runs
# its attribute-override / sanity-validation pipeline on whatever
# ``_load_strategy`` returns, so nothing else in freqtrade's init
# path needs to change.
#
# Restore is guaranteed by the context manager — future Backtesting
# calls in the same process see the stock resolver.


@contextmanager
def register_dynamic_strategy(
    strategy_cls: type,
    name: str = STRATEGY_NAME,
) -> Iterator[None]:
    """Register ``strategy_cls`` with freqtrade's StrategyResolver
    under ``name`` for the lifetime of the ``with`` block.

    Use this around ``Backtesting(config)`` when ``config["strategy"]
    == name``. Outside the block, freqtrade's resolver behaves
    exactly as before.
    """
    from freqtrade.resolvers.strategy_resolver import StrategyResolver

    original_load_strategy = StrategyResolver._load_strategy

    def patched(strategy_name: str, config: dict, extra_dir: str | None = None):
        if strategy_name == name:
            instance = strategy_cls(config=config)
            return StrategyResolver.validate_strategy(instance)
        return original_load_strategy(strategy_name, config, extra_dir)

    StrategyResolver._load_strategy = staticmethod(patched)
    try:
        yield
    finally:
        StrategyResolver._load_strategy = staticmethod(original_load_strategy)


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
