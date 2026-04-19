# Pattern: `impossible_level`

A recurring horizontal support level (≥ 3 touches within the trailing
2 years) coincides with both the 0.786 Fib of an active Wave 1 AND
the 200-month SMA, all converging within ±15 %. The "NKE" setup —
a historically-defended price that now also happens to be a deep
Fibonacci + long-term-trend convergence.

## Detection logic

Same outer loop as `generational_support`, plus a horizontal-S/R
check:

1. Pivots at primary sensitivity → `(W1_start, W1_top, W2_low)` triples.
2. Walk forward. On each day `t`, compute:
   - `horizontal = find_horizontal_level(close[t-504:t+1], min_touches=3, tolerance=0.02)`
     — returns the current close if it's been touched ≥ 3 times in a
     ±2 % band over the trailing 504 trading days (≈ 2 years), else `None`.
3. If `horizontal is not None`, evaluate convergence of
   `{fib786, mma_200(t), horizontal}`:
   - `avg = mean(...)`, `spread = max - min`
   - Fire if `spread / avg < tolerance` AND `|close(t) - avg| / avg < tolerance`.

## Parameters

| Name | Default | Purpose |
| --- | --- | --- |
| `pivot_sensitivity` | `PIVOT_SENSITIVITY_PRIMARY` | same as generational_support |
| `tolerance` | `GENERATIONAL_TOLERANCE` (0.15) | convergence envelope |
| `mma_period` | `MA_SLOW_PERIOD` (200) | long-term MA |
| `horizontal_min_touches` | 3 | touches to qualify as horizontal S/R |
| `horizontal_lookback_days` | 504 (~2 years) | window |
| `horizontal_touch_tolerance` | 0.02 (2 %) | band around candidate level |

## Why it's rarer than `generational_support`

`generational_support` only requires the Fib + origin + 200MMA to
converge. `impossible_level` additionally requires the market to have
repeatedly defended the same dollar price over the recent past. Few
stocks satisfy both.
