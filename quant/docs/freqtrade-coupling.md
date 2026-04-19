# Freqtrade coupling

The simulate_strategy engine runs on top of freqtrade's `Backtesting`
class in library mode. Freqtrade is _not_ designed as a library —
it's a CLI bot — so the surface we depend on is unstable across
minor releases. This document is the adapter's contract with a
specific freqtrade version and the checklist to run when the pin
changes.

**Current pin**: `freqtrade==2026.3` (see `requirements-stage4.txt`).

## Surfaces we touch

The adapter sits entirely in
`quant/src/simualpha_quant/execution/freqtrade_adapter.py` and
`quant/src/simualpha_quant/execution/simulate.py`. Four freqtrade
internals feed into it, listed in decreasing order of
version-fragility:

### 1. `Backtesting.__init__` config schema

`freqtrade.optimize.backtesting.Backtesting(config)` runs a long
init sequence that mutates `config` and reads many keys. The
keys required at init time are enumerated in
`freqtrade.config_schema.config_schema.SCHEMA_TRADE_REQUIRED`. As
of freqtrade 2026.3 they include:

- `exchange` (with `name`, `pair_whitelist`, `pair_blacklist`,
  `ccxt_config`, `ccxt_async_config`, `key`, `secret`)
- `stake_currency`, `stake_amount`, `tradable_balance_ratio`,
  `last_stake_amount_min_ratio`
- `dry_run`, `dry_run_wallet`, `fee`, `max_open_trades`
- `timeframe`, `timerange`
- `pairlists`, `trading_mode`, `margin_mode`
- `process_only_new_candles`, `position_adjustment_enable`,
  `strategy_path`, `strategy`
- `entry_pricing`, `exit_pricing`
- `order_types`, `order_time_in_force`
- `stoploss`, `minimal_roi`
- `dataformat_ohlcv`, `dataformat_trades`
- `internals`

Missing any of these raises a bare `KeyError` deep inside
`validate_config` / `check_exchange` / `validate_pricing`. The
error is opaque — you get `KeyError: 'exit_pricing'` with no hint
about what "the config" means.

**Protection**: `tests/execution/test_freqtrade_config.py`
compares the output of `build_config()` against
`SCHEMA_TRADE_REQUIRED` key-by-key. Failure there happens in CI
before deploy.

### 2. `StrategyResolver.load_strategy(config)`

Called unconditionally from `Backtesting.__init__`. It:

1. Reads a string name from `config["strategy"]`. Empty string
   raises `OperationalException("No strategy set. ...")`.
2. Walks `config["user_data_dir"]/strategies/` + `config
   ["strategy_path"]` looking for a `.py` file containing `class
   <name>(IStrategy):` via textual match.
3. Imports the file, pulls the class, instantiates it with
   `config=config`.

We can't pass a class object directly through config, and writing
our dynamic class to disk would lose its closure over
`StrategySpec` + `runtime_state`. So we install a scoped
monkey-patch on `StrategyResolver._load_strategy` in
`register_dynamic_strategy()` that, for the well-known name
`TLIStrategy`, returns our closure-based instance and falls back
to the original implementation for any other name. The patch is
installed only for the duration of the `Backtesting(config)` call.

**Protection**: `tests/execution/test_freqtrade_config.py::
test_backtesting_init_resolves_dynamic_strategy` drives the real
`Backtesting.__init__` under the context manager and asserts no
`OperationalException("No strategy set")` fires. Exchange init is
stubbed out so the test never hits the network.

### 3. `DataProvider` (`historic_ohlcv`, `ohlcv`, `market`)

During backtest, freqtrade's strategy hot-path calls `self.dp.
ohlcv(pair, timeframe)`. We supply a minimal duck-typed provider
from `make_data_provider()` that reads from our qlib binary store
and returns a DataFrame with columns `date, open, high, low,
close, volume`, where `date` is UTC-naive `datetime64[ns,
UTC]`. The DataProvider is assigned to
`backtesting.dataprovider` after init — freqtrade doesn't call
back into exchange at that point, so the swap is clean.

**Protection**: exercised by the Phase-2 egress-check
(`quant/scripts/egress_check/run.py`). Any shape mismatch in
DataProvider output surfaces as `freqtrade_runtime_failure` with
the real traceback attached.

### 4. `Backtesting.results` output shape

After `backtesting.start()`, results live at
`backtesting.results[strategy_name]["results"]` (trades) and
`["equity_curve"]`. The trades DataFrame has columns `pair,
open_date, close_date, open_rate, close_rate, profit_ratio`. The
equity curve DataFrame has `date, equity` (or `time, balance`).
We normalize both in `_trades_from_freqtrade()` and
`_equity_from_freqtrade()` in `simulate.py`.

**Protection**: `tests/execution/test_simulate_engine.py` exercises
the normalization code through the `synthetic_simulator` test
hook, without requiring freqtrade. Changes to the freqtrade
output shape will surface during the Phase-2 egress-check.

## Bumping the freqtrade pin — checklist

1. Change the pin in `requirements-stage4.txt`.
2. Install the new version in a venv and import it. Note the
   `INFO` / `WARNING` logs during a dry-run `Backtesting(config)`
   — freqtrade logs every config override and every schema
   mismatch.
3. Run `python -c "from freqtrade.config_schema.config_schema
   import SCHEMA_TRADE_REQUIRED; print(sorted(SCHEMA_TRADE_
   REQUIRED))"` and diff the result against the list above.
   Add any new keys to `build_config`.
4. Read `freqtrade/resolvers/strategy_resolver.py`'s
   `_load_strategy` — if the resolver signature changed or
   the filesystem-discovery logic was rewired, the patched
   function in `register_dynamic_strategy` needs updating.
5. Read `freqtrade/data/dataprovider.py`'s `DataProvider` class —
   if new methods are called during backtest, add them to the
   duck-typed `_Provider` in `make_data_provider`.
6. Run `pytest tests/execution/test_freqtrade_config.py` — this
   is the regression gate.
7. Deploy the egress-check artifact to Railway and confirm
   `EGRESS_CHECK_STATUS=PASS`.

## Known breakage points

| freqtrade version | Break                                | Mitigation                                          |
| ----------------- | ------------------------------------ | --------------------------------------------------- |
| 2024.11 → 2026.3  | `exit_pricing` required              | `_default_pricing_block()` in adapter               |
| 2024.11 → 2026.3  | `order_types` required               | `_default_order_types_block()`                      |
| 2024.11 → 2026.3  | `order_time_in_force` required       | `_default_order_tif_block()`                        |
| 2024.11 → 2026.3  | `last_stake_amount_min_ratio` req.   | literal in `build_config`                           |
| 2024.11 → 2026.3  | `dataformat_ohlcv/trades` required   | literal `"feather"` in `build_config`               |
| 2024.11 → 2026.3  | `internals` required                 | `"internals": {}` in `build_config`                 |
| 2024.11 → 2026.3  | strategy MUST resolve via resolver   | `register_dynamic_strategy` context manager        |
| 2024.11 → 2026.3  | `config["strategy"]` MUST be string  | `build_config` sets `"strategy": STRATEGY_NAME`     |

## When to stop using freqtrade

Every freqtrade minor has broken this adapter. If a future
version bump produces a _fourth_ break in the same pattern
(schema / resolver / dataprovider / output), the cost-benefit
inverts: a 300-line pure-Python equity backtester (iterate bars,
evaluate entry/exit rules, track positions, compute stats) is
cheaper to maintain than chasing freqtrade's internals. The
`synthetic_simulator` test hook in `run_simulation` was written
specifically so the replacement can be dropped in without
touching the public API of `simulate_strategy`.

Don't do this preemptively. Do it only when the next break lands.
