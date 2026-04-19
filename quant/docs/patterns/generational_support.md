# Pattern: `generational_support`

The 0.786 Fib retracement of Wave 1, the Wave 1 origin price, and the
200-month SMA converge within ±15 % of each other, with the current
price inside the same envelope. TLI's rarest, highest-conviction
setup (+20 pts, "GENERATIONAL_BUY" badge).

## Spec citations

- `backend/scripts/seed_spec_documents.js:225` — "GENERATIONAL SUPPORT ZONE: 0.786 Fib + Wave 1 origin + 200MMA within 15 %. … bonus += 20, badge = GENERATIONAL_BUY (electric blue badge)."
- `backend/pipeline/confluence_scorer.js:91-99` — runtime:
  ```js
  const values = [f786, w1, mma];
  const spread = Math.max(...values) - Math.min(...values);
  const avg = values.reduce((a, b) => a + b, 0) / 3;
  if (spread / avg < 0.15 && near(avg)) { bonus += 20; badge = 'GENERATIONAL_BUY'; }
  ```

## Detection logic

1. Pivots at **primary (monthly) sensitivity** — Generational setups
   are multi-year, not multi-week.
2. For each `(W1_start, W1_top, W2_low)`:
   - `fib786 = W1_top - 0.786 * (W1_top - W1_start)`
   - `wave1_origin = W1_start.price`
3. Compute `mma_200 = SMA(200-month, aligned to daily)`.
4. Walk forward. On each day:
   - `values = [fib786, wave1_origin, mma_200(t)]`
   - `avg = mean(values)`, `spread = max - min`
   - Fire if `spread / avg < tolerance` AND `|close(t) - avg| / avg < tolerance`.

## Parameters

| Name | Default | Citation |
| --- | --- | --- |
| `pivot_sensitivity` | `PIVOT_SENSITIVITY_PRIMARY` (0.15) | tli_constants §3 |
| `tolerance` | `GENERATIONAL_TOLERANCE` (0.15) | tli_constants §2 |
| `mma_period` | `MA_SLOW_PERIOD` (200) | tli_constants §5 |

## Cold-start behavior

200-month MA needs ~17 years of history. Backtests spanning less than
that will surface no signals — by design.
