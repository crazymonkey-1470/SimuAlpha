# Pattern: `confluence_zone`

Price sits within ±3 % of BOTH the 0.618 Fib of an active Wave 1 AND
the 200-week SMA, with the 200WMA and 0.618 Fib themselves within ±3 %
of each other. TLI's highest-conviction confluence (+15 pts in the
scoring engine).

## Spec citations

- `backend/scripts/seed_spec_documents.js:223` — "CONFLUENCE ZONE: 200WMA + 0.618 Fib within 3 %. … bonus += 15, badge = CONFLUENCE_ZONE (highest conviction)."
- `backend/pipeline/confluence_scorer.js:17,80` — runtime: `tolerance = 0.03`, `Math.abs(wma - fib618) / fib618 < 0.03 && near(wma)`.

## Detection logic

1. `detect_pivots(close, …)` → pivots.
2. `find_developing_wave_2(pivots)` gives every `(W1_start, W1_top, W2_low)`.
3. For each triple, compute `fib618 = W1_top - 0.618 * (W1_top - W1_start)`.
4. Compute `wma_200 = SMA(200-week, aligned to daily)`.
5. Walk forward from `W1_top`. On each day, check:
   - `|wma_200(t) - fib618| / fib618 ≤ tolerance`
   - `|close(t) - fib618| / fib618 ≤ tolerance`
   - `|close(t) - wma_200(t)| / wma_200(t) ≤ tolerance`
6. `min_consecutive_days` bars in a row passing all three → signal.

## Parameters

| Name | Default | Citation |
| --- | --- | --- |
| `pivot_sensitivity` | `PIVOT_SENSITIVITY_INTERMEDIATE` | tli_constants §3 |
| `tolerance` | `CONFLUENCE_ZONE_TOLERANCE` (0.03) | tli_constants §2 |
| `wma_period` | `MA_SLOW_PERIOD` (200) | tli_constants §5 |
| `min_consecutive_days` | 1 | module default |

## Cold-start behavior

The 200-week SMA requires 200 completed weeks ≈ 4 years of data before
it's defined. Backtests shorter than ~4 years will surface no
confluence-zone signals — this is correct, not a bug.
