# Real-data verification runbook

One-page cheat sheet for populating Supabase with real OpenBB data
and running `backtest_pattern wave_2_at_618` against the 50-ticker
verification universe (2010-01-01 → 2020-12-31). Stage 4.5 follow-up
— meant to be run **on your own machine** (network-unrestricted) to
get the real numbers before the OpenClaw integration sprint.

## 1. Prereqs

- Python **3.12** (3.11 won't work — `pandas-ta` dropped 3.11 wheels).
- A Supabase project with the Stage-1 + Stage-3 migrations applied:
  - `supabase/migration_quant_data.sql`
  - `supabase/migration_quant_backtest.sql`
- An OpenBB Platform personal access token
  ([obb.co/sign-up](https://my.openbb.co)).

## 2. Env vars

Put these in `quant/.env` (the seed script auto-loads via
`python-dotenv`):

```bash
OPENBB_PAT=<your OpenBB Platform PAT>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service role JWT>
```

Optional overrides:

| Var | Default | Purpose |
| --- | --- | --- |
| `SEED_UNIVERSE` | `scripts/universes/verification_50.txt` | swap in another ticker file |
| `SEED_START` | `2010-01-01` | override start date for ingestion |
| `SEED_END` | `2020-12-31` | override end date for ingestion |
| `BACKTEST_START` | `2010-01-01` | backtest window start (independent of seed window) |
| `BACKTEST_END` | `2020-12-31` | backtest window end |
| `LOG_LEVEL` | `INFO` | bump to `DEBUG` if a ticker fails silently |

## 3. Install

```bash
cd quant
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Stage 4 extras (freqtrade) only if you also want simulate_strategy:
# pip install -r requirements-stage4.txt
```

## 4. Seed Supabase (one command)

```bash
python scripts/seed_verification_universe.py
```

Pulls daily OHLCV for all 50 tickers in
`scripts/universes/verification_50.txt`, upserts into `prices_daily`.

- Idempotent: re-running won't double-write (PK on `(ticker, date)`).
- Incremental: subsequent runs only fetch the missing tail.
- Expect 1-3 minutes wall time depending on OpenBB rate limits.
- The script prints a single line on success:
  `seed done: N rows across 50 tickers from 2010-01-01 to 2020-12-31`.

If a single ticker errors the script logs it and continues — open the
output and grep for `price fetch failed` to spot any holes.

### If you only want a subset

Edit `scripts/universes/verification_50.txt` (one ticker per line,
`#` comments OK) or point at a different file:

```bash
SEED_UNIVERSE=scripts/universes/my_25.txt python scripts/seed_verification_universe.py
```

## 5. Run the backtest (one command)

```bash
python scripts/run_verification_backtest.py
```

Reads from Supabase (no network fetches), runs `wave_2_at_618` over
the full universe + window, prints structured output ending with a
single `BACKTEST_RESULT_JSON=…` line for easy scraping.

## 6. Expected output format

```
=== backtest_pattern wave_2_at_618 ===
universe:     50 tickers (verification_50.txt)
window:       2010-01-01 .. 2020-12-31
signal_count: <N>

stats by horizon:
   3m: n=<N>  hit_rate=<X>%  median=<X>%  p25=<X>%  p75=<X>%  avg_dd=<X>%
   6m: n=<N>  hit_rate=<X>%  median=<X>%  p25=<X>%  p75=<X>%  avg_dd=<X>%
  12m: n=<N>  hit_rate=<X>%  median=<X>%  p25=<X>%  p75=<X>%  avg_dd=<X>%
  24m: n=<N>  hit_rate=<X>%  median=<X>%  p25=<X>%  p75=<X>%  avg_dd=<X>%

first 10 sample signals:
  AAPL   2013-04-19  close=$  61.30  3m=+12.3% 6m=+25.6% 12m=+30.1% 24m=+47.2%
  ...

per-year breakdown (12-month horizon):
  2010  n=<N>  hit_rate=<X>%  median=<X>%
  2011  n=<N>  hit_rate=<X>%  median=<X>%
  ...

BACKTEST_RESULT_JSON={"tickers": 50, ..., "stats": [...]}
```

## 7. Sanity-check guidance

### Hit-rate ranges

For TLI's primary entry (`wave_2_at_618` — 0.5–0.618 fib retracement
of Wave 1, 50-day MA confirmation):

| Horizon | Plausible | Suspicious — investigate |
| --- | --- | --- |
| 3 m | **45 % – 70 %** | < 30 % or > 80 % |
| 6 m | **45 % – 70 %** | < 30 % or > 80 % |
| 12 m | **40 % – 70 %** (decay with horizon is normal) | < 25 % or > 85 % |
| 24 m | **40 % – 65 %** (or n=0 if window doesn't allow 2-year lookahead) | > 90 % |

Notes:
- 2010-2020 is a long bull market for US equities. Even random entries
  produce high hit rates over 12+ months. Compare your numbers
  against an SPY buy-and-hold baseline (~+250% over the window) to
  judge "is the pattern actually adding alpha or just riding the
  market?" If your 12-month median return is below SPY's average
  rolling 12-month return (~+13%), the signal isn't earning its
  complexity.
- Signal counts scale with how many of the 50 tickers had structural
  Wave 1 → Wave 2 setups in the window. Expect roughly **50-200
  signals total** across 50 tickers × 11 years. Far below or above
  that = check for a bug.

### Sample-signal sanity

For each of the first 10 sample signals, eyeball:

1. **Plausible price.** `signal_close` should be within historical
   ranges. If AAPL shows `close=$3.50` in 2015 something's wrong (no
   split-adjustment).
2. **Plausible date.** No weekends, no signals from before the
   ticker's IPO date (e.g. ROKU pre-2017 → bug).
3. **Forward returns shape.** If every signal shows the same
   `+25% / +30% / +40% / +50%` ladder regardless of ticker, the
   forward-return computation is broken (probably reading the wrong
   bar). They should be diverse across tickers.

### Red-flag patterns

| What you see | What it means |
| --- | --- |
| `signal_count: 0` | Pivot detector isn't finding swings — check `PIVOT_SENSITIVITY_INTERMEDIATE = 0.08` matches your timeframe. |
| Hit rate exactly 100 % | Forward-return window is < 1 trading day, or the engine is reading the entry bar as the exit bar. |
| `n=0` at 3 m, large `n` at 24 m | Date arithmetic backwards — should be the opposite. |
| All signals on the same date | Detector is firing on a global indicator (e.g. always-true at chart start), not per-ticker. |
| Median return identical to mean return | All trades have identical magnitude — check for division by zero in the per-bar return calc. |

### Where to look if something's off

| Symptom | Likely culprit |
| --- | --- |
| Wrong prices | `prices_daily` upsert path — check `simualpha_quant.data.openbb_ingest` |
| Missing signals | `simualpha_quant.research.waves.detect_pivots` sensitivity, or `simualpha_quant.research.patterns.wave_2_at_618` band tolerance |
| Forward returns wrong | `simualpha_quant.research.backtest._forward_return_and_dd` |
| Sample selection skewed | `simualpha_quant.research.backtest._sample_signals` |

## 8. After you're satisfied

Capture the `BACKTEST_RESULT_JSON` line — that's the artifact
OpenClaw integration depends on. If the numbers look right, proceed
to the OpenClaw integration plan
(`docs/openclaw-integration-plan.md`). If they look wrong, **stop**
and surface to me before any tool changes — the right next move is
inspection, not adjustment.

## 9. Cleanup

The seed runs leave `prices_daily` populated. That's fine — the
`get_price_history` cache-first tool benefits from having the cache
warm. If you want to drop the data:

```sql
delete from prices_daily where ticker = any(array[
  'AAPL','MSFT','GOOGL', ...
]);
```

Or just delete the whole table and re-apply `migration_quant_data.sql`.
