# Pattern: `wave_4_at_382`

Wave 4 of an Elliott impulse retraces near the 0.382 Fib of Wave 3,
with the non-overlap rule `wave4_low > wave1_top` enforced. Confirmed
when price closes back above the Wave 4 low.

## Spec citations

- `backend/scripts/seed_spec_documents.js:73` — Rule 3: `wave4_low > wave1_top`.
- `backend/scripts/seed_spec_documents.js:175` — `wave4_target = wave3_top - 0.382 * (wave3_top - wave2_low)`.
- `backend/scripts/seed_spec_documents.js:188` — "Wave 4: 0.382 of Wave 3 = ADD zone".
- `backend/services/elliott_wave.js:145` — runtime uses tighter 0.10 tolerance on W4 = 0.382.

## Detection logic

1. `detect_pivots(close, …)` → pivots.
2. `find_developing_wave_4(pivots)` returns every
   `(W1_start, W1_top, W2_low, W3_top, W4_low)` that passes Rules 1 + 3
   and has `W3 ≥ W1`.
3. Compute `target = W3_top - 0.382 * (W3_top - W2_low)`.
4. Reject if `|W4_low - target| / |target| > fib_tolerance`.
5. The signal date is the first day after `W4_low` where `close > W4_low`.

## Parameters

| Name | Default | Citation |
| --- | --- | --- |
| `pivot_sensitivity` | `PIVOT_SENSITIVITY_INTERMEDIATE` | tli_constants §3 |
| `fib_tolerance` | `WAVE4_FIB_VALIDATION_TOLERANCE` (0.10) | tli_constants §4 |
| `max_confirmation_days` | 30 | module default |

## Example signal

In the hand-built fixture:

- W3 top at 165, W2 low at 115 → target = 165 − 0.382 × 50 = **145.9**.
- Actual W4 low = 145 (deviation 0.6 % ≤ 10 %).
- Signal fires on the first day `close > 145`.

## Out of scope (Stage 3)

Diagonal pattern variants (leading / ending) allow W4/W1 overlap. They
are **not** handled by this detector — Stage 3.5 will add them along
with the full corrective family (Zigzag, Regular Flat, Expanded Flat,
Triangle).
