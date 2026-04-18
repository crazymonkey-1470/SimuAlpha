# Strategy DSL (Stage 4)

OpenClaw composes a full plan — entry + tranche ladder + exit legs +
stop + position sizing — as a ``StrategySpec``. The ``simulate_strategy``
tool runs that plan end-to-end against historical data via freqtrade
and returns outcome statistics plus annotated charts of representative
trades.

## Why not express everything with ``backtest_pattern``

``backtest_pattern`` validates whether a signal is profitable in
isolation — "when this pattern fires, what's the forward return 3 / 6 /
12 / 24 months later on average?" It does not simulate the trader's
actual behavior: how they scale in, when they trim, where their stop
sits, what they do if the market dumps through their stop.

``simulate_strategy`` runs the **full plan**. It tells you whether the
plan's Sharpe, profit factor, max drawdown, and per-horizon hit rate
justify the signal's headline hit rate.

Rule of thumb:

1. Validate the **signal** with ``backtest_pattern`` first. Cheap.
2. Validate the **plan** with ``simulate_strategy`` only after the
   signal clears the bar. Expensive — runs freqtrade per trade.

## Top-level shape

```jsonc
{
  "strategy": {
    "entry":  { /* EntryRules  */ },
    "exit":   { /* ExitRules   */ },
    "position_sizing": { /* PositionSizing */ },
    "universe_spec":   { /* UniverseSpec   */ },
    "date_range":      { "start": "2015-01-01", "end": "2024-12-31" },
    "horizons":        [3, 6, 12, 24],
    "initial_capital": 100000,
    "max_open_positions": 10
  },
  "chart_samples": 5
}
```

### EntryRules

```jsonc
{
  "pattern_name": "wave_2_at_618",       // exactly one of pattern_name
  "custom_expression": null,             // or custom_expression
  "tranches": [
    { "pct_of_position": 0.10, "price_rule": { "type": "at_signal" } },
    { "pct_of_position": 0.15, "price_rule": { "type": "at_fib", "level": 0.382 } },
    { "pct_of_position": 0.20, "price_rule": { "type": "at_fib", "level": 0.5 } },
    { "pct_of_position": 0.25, "price_rule": { "type": "at_fib", "level": 0.618 } },
    { "pct_of_position": 0.30, "price_rule": { "type": "at_fib", "level": 0.786 } }
  ]
}
```

**Important:** ``pct_of_position`` = fraction of the **planned total
position** (NOT of remaining capital). Each tranche's USD stake is
computed at trade open as ``pct_of_position * planned_total_usd``.
``planned_total_usd`` is determined by ``position_sizing`` at entry
time. Tranches must sum to 1.0 — otherwise the validator rejects the
spec. Default (if ``tranches`` is omitted) is the 5-step
10/15/20/25/30 ladder mirroring backend Sprint 10B.

Entry supports both modes:
- **``pattern_name``** — any name registered in
  ``simualpha_quant.research.patterns``. Cheaper; battle-tested.
- **``custom_expression``** — full Stage-3 JSON DSL (see
  ``custom-expression-dsl.md``). Reused verbatim. Use for novel
  setups.

Exactly one must be set. XOR is validator-enforced.

### ExitRules

```jsonc
{
  "take_profit": [
    { "pct_of_position": 0.5, "price_rule": { "type": "at_fib", "level": 1.618 } },
    { "pct_of_position": 0.5, "price_rule": { "type": "at_fib", "level": 2.618 } }
  ],
  "stop_loss": {
    "price_rule": { "type": "at_fib", "level": 0.786 },
    "type": "hard"                       // or "trailing"
  },
  "time_stop_days": 365                  // close if still open after N calendar days (optional)
}
```

- ``take_profit`` legs evaluated in **spec order** — first leg whose
  price is hit fires first. **Two legs with identical price rules are
  rejected** at validation time; the engine never silently reorders.
- Sum of ``pct_of_position`` across take-profit legs may be ≤ 1.0; the
  residual rides the stop-loss / time-stop.
- ``stop_loss.type``:
  - ``hard`` — static stop at the resolved price.
  - ``trailing`` — stop trails the running high at the same offset
    (computed from the ``price_rule`` against the current bar).
- ``time_stop_days`` — absolute cutoff (calendar days). Optional; omit
  to let trades run.

### PriceRule (used everywhere: tranches, exits, stops)

| type | extra fields | meaning |
| --- | --- | --- |
| ``at_signal`` | — | close of the bar the entry signal fired. |
| ``at_price`` | ``price`` (float) | literal dollar price. |
| ``at_fib`` | ``level`` (float) | Fibonacci retracement of the currently-developing Wave 1. |
| ``at_ma`` | ``period``, ``freq`` ∈ {daily, weekly, monthly} | moving-average value at the current bar. |

If a rule can't resolve at a given bar (e.g. 200 SMA still warming up,
or no Wave 1 formed yet), the engine skips that bar's check —
``UnresolvablePriceRule`` is swallowed internally.

### PositionSizing

```jsonc
{ "method": "fixed",              "params": { "stake_usd": 10000 } }
{ "method": "volatility_target",  "params": { "target_vol_pct": 0.02, "atr_period": 14 } }
{ "method": "kelly_fraction",     "params": { "kelly_fraction": 0.25 } }
```

Each method has its own required ``params`` keys; missing keys are
rejected by the validator.

### chart_samples (request-level, outside ``strategy``)

- ``0`` — skip chart rendering entirely. ``trade_log_sample`` is empty.
- ``1..5`` — render inline. Each ``trade_log_sample[i].chart_url`` is
  populated; ``chart_status = "rendered"``.
- ``6..20`` — render **asynchronously**. Response returns each trade
  with ``chart_status = "pending"`` and a top-level ``charts_job_id``.
  Poll ``GET /v1/jobs/{charts_job_id}``; each time the cached
  simulation result is patched with newly-rendered URLs. Repeat runs
  with the same spec return cached URLs instantly.

Chart rendering **always** goes through an in-process import of
``simualpha_quant.tools.render_chart.render_tli_chart`` — never HTTP,
never MCP.

## Response shape

```jsonc
{
  "summary_stats": {
    "total_trades": 42,
    "win_rate": 0.67,
    "avg_win_pct": 0.23,
    "avg_loss_pct": -0.08,
    "profit_factor": 3.1,
    "sharpe": 1.4,
    "sortino": 2.0,
    "max_drawdown_pct": -0.18,
    "calmar": 0.9
  },
  "per_horizon_outcomes": [
    { "horizon_months":  3, "reached_target_pct": 0.45 },
    { "horizon_months":  6, "reached_target_pct": 0.60 },
    { "horizon_months": 12, "reached_target_pct": 0.72 },
    { "horizon_months": 24, "reached_target_pct": 0.85 }
  ],
  "equity_curve": [100000, 101200, ...],                // close-only, ≤500 buckets
  "equity_curve_dates": ["2020-01-01", ...],
  "equity_curve_ohlc": [                                 // same dates; OHLC per bucket
    { "date": "2020-01-01", "open": 100000, "high": 100500, "low": 99800, "close": 100200 }
  ],
  "trade_log_sample": [
    {
      "ticker": "HIMS",
      "entry_date": "2024-05-06",
      "exit_date":  "2024-11-08",
      "entry_price": 19.50,
      "exit_price":  31.40,
      "outcome_pct": 0.61,
      "chart_url":   "https://.../charts/HIMS/daily/<hash>.png",
      "chart_status": "rendered"
    }
  ],
  "charts_job_id": null,
  "cached": false,
  "hash": "a1b2c3...",
  "job_id": null,
  "computed_at": "2026-04-18T..."
}
```

## Worked example — TLI Wave 2 at 0.618

A full plan for HIMS Wave 2 confluence: 5-tranche DCA through the fib
band, 3-leg take-profit (Wave 3 target → Wave 5 target → trailing
residual), hard stop below the Wave 1 origin.

```jsonc
{
  "strategy": {
    "entry": {
      "pattern_name": "wave_2_at_618"
    },
    "exit": {
      "take_profit": [
        { "pct_of_position": 0.20, "price_rule": { "type": "at_fib", "level": 1.618 } },
        { "pct_of_position": 0.50, "price_rule": { "type": "at_fib", "level": 2.618 } },
        { "pct_of_position": 0.30, "price_rule": { "type": "at_ma", "period": 50, "freq": "daily" } }
      ],
      "stop_loss": {
        "price_rule": { "type": "at_price", "price": 11.00 },
        "type": "hard"
      },
      "time_stop_days": 540
    },
    "position_sizing": {
      "method": "fixed",
      "params": { "stake_usd": 10000 }
    },
    "universe_spec": {"tickers": ["HIMS"]},
    "date_range":    {"start": "2023-01-01", "end": "2024-12-31"},
    "horizons": [3, 6, 12, 24],
    "initial_capital": 100000,
    "max_open_positions": 5
  },
  "chart_samples": 5
}
```

What the simulator does:

1. Runs ``wave_2_at_618`` against HIMS daily OHLCV in the window.
2. On each signal, opens a trade and uses ``adjust_trade_position``
   to add the 10 / 15 / 20 / 25 / 30 tranches as price revisits the
   fib ladder.
3. Checks ``custom_exit`` each bar — first TP leg at 1.618 extension
   trims 20 %, next at 2.618 extension trims 50 %, residual trails to
   the 50-day MA.
4. Hard stop at $11 (Wave 1 origin).
5. Returns summary stats, per-horizon outcomes, and up to 5 annotated
   charts rendered inline.

## Validation failures worth knowing

| Error | Cause | Fix |
| --- | --- | --- |
| `tranches.pct_of_position must sum to 1.0` | Tranche pcts don't total exactly 1.0 (within 1e-6). | Adjust so they sum to 1. |
| `duplicate tranche price_rule(s)` | Two tranches share a canonical price rule (same type + same level / period / freq). | Make each tranche's rule distinct. |
| `duplicate take_profit price_rule(s)` | Same. Spec order is the tie-breaker — duplicates would be ambiguous. | Make each leg distinct. |
| `take_profit legs sum to X (>1.0)` | Exit legs over-commit the position. | Trim to ≤ 1.0. |
| `entry: exactly one of pattern_name or custom_expression` | XOR violated. | Set exactly one. |
| `at_fib requires 'level' in (0, 4.0)` | ``at_fib`` missing / bad level. | Supply a Fibonacci ratio. |
| `at_ma requires 'freq' (daily/weekly/monthly)` | ``at_ma`` missing freq. | Add ``freq``. |
