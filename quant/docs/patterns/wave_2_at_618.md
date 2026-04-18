# Pattern: `wave_2_at_618`

Wave 2 of an Elliott impulse retraces into the 0.5–0.618 Fib band of
Wave 1, then closes back above its 50-day SMA.

## Spec citations

- `backend/scripts/seed_spec_documents.js:69` — Rule 1: `wave2_low > wave1_start`.
- `backend/scripts/seed_spec_documents.js:167-168` — `wave2_target = wave1_top - 0.618 * (wave1_top - wave1_start)`, `wave2_range = (0.5, 0.618)`.
- `backend/scripts/seed_spec_documents.js:186` — "Wave 2: 0.5-0.618 of Wave 1 = BUY ZONE".
- `backend/scripts/seed_spec_documents.js:194-196` — "Price at 0.618 Fib alone is NOT sufficient. Must break AND hold above 50-day MA to confirm Wave 2 complete."

## Detection logic

1. `detect_pivots(close, sensitivity=PIVOT_SENSITIVITY_INTERMEDIATE)` →
   alternating LOW/HIGH pivots.
2. `find_developing_wave_2(pivots)` returns every `(W1_start, W1_top, W2_low)`
   triple that passes Rule 1.
3. For each triple, compute the entry band
   `wave_2_entry_band(W1_start, W1_top) = (deeper, shallower)`
   where `deeper = W1_top - 0.618 * height`, `shallower = W1_top - 0.5 * height`.
4. Slack band: `[deeper * (1 - band_tolerance), shallower * (1 + band_tolerance)]`.
   W2 low must land inside the slack band.
5. Walk forward up to `max_confirmation_days` trading days. The first day
   where both `close >= deeper` and `close > 50-day SMA` is the signal.

## Parameters

| Name | Default | Citation |
| --- | --- | --- |
| `pivot_sensitivity` | `PIVOT_SENSITIVITY_INTERMEDIATE` (0.08) | tli_constants §3 |
| `ma_fast_period` | `MA_FAST_PERIOD` (50) | tli_constants §5 |
| `band_tolerance` | 0.05 (5 % of band height) | module default |
| `max_confirmation_days` | 30 trading days (~6 weeks) | module default |

## Example signal

Given the hand-built 5-wave fixture in `tests/research/conftest.py`:

- W1: 100 → 130, W2 retraces to 115 (exactly 0.5 of W1).
- Band: `(111.46, 115.0)` (0.618, 0.5 prices).
- First day the close re-crosses the 50-day MA while still ≥ 111.46: signal.

## Diagnostics

Pattern fires only once per `(W1, W2)` triple. If the same impulse is
still open and the detector runs again on a longer window, a new
signal is not re-emitted for that triple.
