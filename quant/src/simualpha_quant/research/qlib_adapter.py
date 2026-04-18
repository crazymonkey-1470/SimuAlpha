"""qlib adapter + TLI factor expressions — STAGE 3 STUB (not implemented).

Converts Supabase `prices_daily` / `fundamentals_quarterly` into qlib's
binary dataset layout, then defines the TLI factor expressions used by the
research and ranking pipeline.

TODO (Stage 3):
- [ ] Build `export_qlib_dataset(out_dir)`: pulls prices_daily for the full
      universe, writes qlib-compatible binaries
      (`<out_dir>/features/<ticker>/{open,high,low,close,volume,factor}.day.bin`)
      plus `instruments/all.txt` and `calendars/day.txt`.
- [ ] Build `export_fundamentals(out_dir)`: long-format quarterly metrics
      → a qlib PIT (point-in-time) fundamentals feed.
- [ ] Initialize qlib with a ProviderURI that points at our export dir.

TLI factor expressions (qlib Alpha expression syntax):

- [ ] Fibonacci retracement levels from the active Wave 1 impulse:
        fib_236 = Ref($wave1_high, 0) - 0.236 * ($wave1_high - $wave1_low)
        fib_382 = ... 0.382 ...
        fib_500 = ... 0.5 ...
        fib_618 = ... 0.618 ...
        fib_786 = ... 0.786 ...
      Distance-to-fib signals: ($close / fib_618) - 1, etc.

- [ ] 200WMA / 200MMA confluence:
        sma_200d = Mean($close, 200)
        sma_200w = Mean(Resample($close, 'W'), 200)
        sma_200m = Mean(Resample($close, 'M'), 200)
        confluence = Abs(sma_200w / sma_200m - 1) < 0.03  # within 3%

- [ ] Wave 2 vs Wave 4 pullback differentiation:
        wave2_retrace_pct = ($wave1_high - $wave2_low) / ($wave1_high - $wave1_low)
        wave4_retrace_pct = ($wave3_high - $wave4_low) / ($wave3_high - $wave3_low)
        is_wave2_zone = wave2_retrace_pct.between(0.5, 0.786)
        is_wave4_zone = wave4_retrace_pct.between(0.236, 0.5) \\
                        & (wave4_low > wave1_high)  # non-overlap rule

- [ ] TLI composite factor: weighted sum of confluence, fib proximity, wave-
      zone indicator, fundamental momentum (revenue growth, FCF growth).

- [ ] Backtest harness: qlib.contrib.strategy.TopkDropoutStrategy ranking
      long book by TLI factor; daily rebalance; TLI-aligned benchmark.

- [ ] CLI: `python -m simualpha_quant.cli export-qlib --out ./qlib_data`
      and `... run-backtest --config configs/tli.yaml`.

When implemented, register the agent-facing tool (likely
`backtest_pattern`) in `simualpha_quant.tools.registry.TOOLS`.

Do NOT implement until Stage 3 begins.
"""

from __future__ import annotations


def export_qlib_dataset(*args, **kwargs):
    raise NotImplementedError(
        "qlib adapter is a Stage 3 deliverable; not implemented yet."
    )


def run_backtest(*args, **kwargs):
    raise NotImplementedError(
        "TLI backtest is a Stage 3 deliverable; not implemented yet."
    )
