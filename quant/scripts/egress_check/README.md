# Railway egress check — Stage 4.5 follow-up

One-shot deploy that answers the open question from Stage 4.5:

> Does freqtrade 2026.3's `Backtesting.__init__` call to
> `binance.com/api/v3/exchangeInfo` succeed from Railway's default
> egress?

If it does, `simulate_strategy` graduates from "beta — synthetic-path
only" to ready-for-OpenClaw. If it doesn't, the project chooses
between vendoring the binance markets fixture or replacing freqtrade
with a pure-Python equity backtester.

## What this branch contains

- `quant/scripts/egress_check/run.py` — the diagnostic. Two phases:
  1. Direct HTTP probe of `https://api.binance.com/api/v3/exchangeInfo`.
  2. If phase 1 passes, a minimal end-to-end `simulate_strategy` run
     (3-ticker synthetic universe, real freqtrade `Backtesting` loop)
     that exercises every piece of the adapter in production
     conditions and prints a structured single-line summary.
- `quant/scripts/egress_check/Dockerfile` — minimal container image
  built only for this check. Smaller than the full quant image.
- `quant/scripts/egress_check/railway.json` — Railway config; CMD
  runs `run.py` and exits.
- This README.

## How to deploy (operator runbook)

You need: a Railway account, a Railway project (any project — this
spins up a one-shot service), and the `railway` CLI installed.

```bash
cd quant/scripts/egress_check
railway login                                       # one-time
railway link                                        # pick your dev project
railway up --service egress-check --detach          # deploys this dir
railway logs --service egress-check                 # watch the diagnostic
```

The container exits with status 0 (PASS), 1 (binance unreachable),
or 2 (freqtrade loop failed). Logs always emit one of:

```
EGRESS_CHECK_STATUS=PASS  freqtrade=2026.3.0  trades=N  win_rate=...  sharpe=...  max_dd=...  duration_s=...
EGRESS_CHECK_RESULT_JSON={"trade_count": N, "win_rate": ..., ...}
```

or

```
EGRESS_CHECK_STATUS=FAIL  stage=<phase_1|phase_2>  reason=<short>
EGRESS_CHECK_NEXT=<what to do>
```

After reading the result, **delete the egress-check service** to
avoid leaving an unused Railway service running.

## What to look for in the PASS output

The phase-2 summary fields should be in these ranges (for the
hard-coded synthetic three-ticker fixture):

| Field | Plausible range |
| --- | --- |
| `trade_count` | 1 to 6 |
| `win_rate` | 0.50 to 1.00 |
| `sharpe` | -2 to +5 (the universe is small) |
| `max_drawdown_pct` | -0.20 to 0 |
| `equity_points` | trade_count + 1 (one initial-capital point + one per closed trade) |

Crucially, the SHAPE of the result must be identical to what the
synthetic-simulator path produced in Stage 4.5 (same fields, same
types). Any difference in shape — missing fields, type mismatches,
extra fields — should be flagged before declaring PASS.

## Why this is a separate Dockerfile / config

The full quant image installs `requirements.txt` only (the four
green tools); Stage-4 extras are an opt-in install. This egress-check
container installs `requirements.txt + requirements-stage4.txt` so
freqtrade is importable. Keeping it out of the main Railway services
means the green tools aren't gated on the egress answer.

## After deploy

Report back with:
- Pass / fail status line from the logs.
- If PASS: the EGRESS_CHECK_RESULT_JSON line, and any visual diff vs.
  the Stage-4.5 synthetic-simulator output (the win-rate / sharpe /
  drawdown should be in the same order of magnitude).
- If FAIL: the error string + which phase failed.

Branch: `claude/stage4.5-railway-egress-check`. Do not push to main;
delete the Railway service after the result is captured.
