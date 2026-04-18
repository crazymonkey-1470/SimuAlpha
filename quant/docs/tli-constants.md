# TLI Constants Reference

Single source of truth for every threshold, Fibonacci level, and
tolerance used by the SimuAlpha scoring engine. Stage 3 pattern
detectors (and any future code that touches TLI logic) import from
`simualpha_quant.tli_constants`. **Do not hard-code these values
elsewhere.** If a pattern needs a different value than the default,
expose it as a parameter and document the override.

Every value below is cited with `<file>:<line>` from the existing
SimuAlpha codebase. When the runtime code (`backend/services/...` or
`backend/pipeline/...`) and the spec text (`backend/scripts/seed_*.js`)
disagree, the **runtime code wins**, and the discrepancy is noted.

---

## 1. Fibonacci ratios (`FIB_*`)

| Constant | Value | Used for |
| --- | --- | --- |
| `FIB_236` | 0.236 | Lower-bound retracement / extension |
| `FIB_382` | 0.382 | Wave 4 retracement target; corrective lower bound |
| `FIB_500` | 0.5   | Wave 2 entry lower bound; Wave C zigzag re-entry |
| `FIB_618` | 0.618 | Wave 2 primary entry; Wave C target |
| `FIB_786` | 0.786 | GENERATIONAL fib level |
| `FIB_1000` | 1.0   | Wave 5 base extension |
| `FIB_1618` | 1.618 | Wave 3 target |
| `FIB_2000` | 2.0   | Extended Wave 3 multiplier check |
| `FIB_2618` | 2.618 | Wave 5 max extension; Extended Wave 3 widened target |

**Citations:**
- `backend/scripts/seed_doc_1_scoring.js:27` — list of confluence Fib levels (0.382, 0.5, 0.618, 0.786)
- `backend/scripts/seed_doc_1_scoring.js:33` — Wave 2 entry 0.5-0.618; Wave 3 target 1.618x; Wave 4 pullback 0.382; Wave 5 target 1.0-2.618; Wave C target 0.618
- `backend/scripts/seed_spec_documents.js:167` — `wave2_target = wave1_top - (wave1_height * 0.618)`
- `backend/scripts/seed_spec_documents.js:168` — Wave 2 range `(0.5, 0.618)`
- `backend/scripts/seed_spec_documents.js:171` — `wave3_target = wave2_low + (wave1_height * 1.618)`
- `backend/scripts/seed_spec_documents.js:175` — `wave4_target = wave3_top - (wave3_height * 0.382)`
- `backend/scripts/seed_spec_documents.js:178-179` — `wave5_target_base = + 1.0`, `wave5_target_extended = + 2.618`
- `backend/scripts/seed_spec_documents.js:182` — `wave_C_target` uses 0.618 of entire impulse
- `backend/scripts/seed_spec_documents.js:344` — Extended Wave 3 if `wave3_length > wave1_height * 2.0`; widen target from 1.618 to 2.618
- `backend/services/elliott_wave.js:132-133` — Wave 2 retracement validation (0.382-0.618 sweet spot, 0.236-0.786 broader)

---

## 2. Confluence-zone tolerances

| Constant | Value | Used for |
| --- | --- | --- |
| `CONFLUENCE_ZONE_TOLERANCE` | **0.03** (3 %) | Distance between 200WMA and 0.618 Fib |
| `CONFLUENCE_PROXIMITY` | **0.03** (3 %) | Distance between price and a single support level |
| `GENERATIONAL_TOLERANCE` | **0.15** (15 %) | Spread of {0.786 Fib, Wave 1 origin, 200MMA} relative to mean |
| `ROUND_NUMBER_TOLERANCE` | **0.02** (2 %) | Distance between price and a round-dollar level |

**Citations (runtime — these win):**
- `backend/pipeline/confluence_scorer.js:17` — `const tolerance = 0.03; // 3% proximity`
- `backend/pipeline/confluence_scorer.js:80` — `Math.abs(wma - fib618) / fib618 < 0.03 && near(wma)` → CONFLUENCE_ZONE
- `backend/pipeline/confluence_scorer.js:33` — `roundLevels.some(r => Math.abs(price - r) / r < 0.02)`
- `backend/pipeline/confluence_scorer.js:91-99` — GENERATIONAL: `spread / avg < 0.15 && near(avg)` where `avg = mean(0.786 Fib, Wave 1 origin, 200MMA)`

**Citations (spec text):**
- `backend/scripts/seed_doc_1_scoring.js:27` — "CONFLUENCE ZONE (200WMA + 0.618 Fib within 3%) +15. GENERATIONAL BUY (0.786 + W1 origin + 200MMA within 15%) +20."
- `backend/scripts/seed_spec_documents.js:223` — same (3 %)
- `backend/scripts/seed_spec_documents.js:225` — same (15 %)
- `backend/scripts/seed_spec_documents.js:269-270` — Special Badges restate same thresholds

---

## 3. Pivot-detection sensitivity

| Constant | Value | Frequency |
| --- | --- | --- |
| `PIVOT_SENSITIVITY_PRIMARY` | **0.15** (15 %) | Monthly chart — Primary degree |
| `PIVOT_SENSITIVITY_INTERMEDIATE` | **0.08** (8 %) | Weekly chart — Intermediate degree |

A pivot is confirmed when price retraces ≥ `sensitivity` from the
running high/low.

**Citations:**
- `backend/services/elliott_wave.js:15` — JSDoc: "0.15 for monthly (Primary), 0.08 for weekly (Intermediate)"
- `backend/services/elliott_wave.js:418` — `{ label: 'monthly', degree: 'primary', sensitivity: 0.15 }`
- `backend/services/elliott_wave.js:48,64` — `(lastPivot - curr) / lastPivot >= sensitivity` → confirm pivot
- `backend/services/backtester.js:42` — `detectPivots(knownHistory, 0.15)`

---

## 4. Fib-relationship validation tolerances

Used when validating wave structures against ideal Fib ratios (e.g.
"is Wave 3 close to 1.618× Wave 1?").

| Constant | Value | Where applied |
| --- | --- | --- |
| `FIB_VALIDATION_TOLERANCE` | **0.15** (15 %) | Default for `isFibClose()` |
| `WAVE4_FIB_VALIDATION_TOLERANCE` | **0.10** (10 %) | Tighter for Wave 4 = 0.382 of Wave 3 |

**Citations:**
- `backend/services/elliott_wave.js:90` — `function isFibClose(actual, expected, tolerance = 0.15)`
- `backend/services/elliott_wave.js:137-139` — Wave 3 ratios validated at 0.15
- `backend/services/elliott_wave.js:145` — `isFibClose(w4_retrace, 0.382, 0.10)` — Wave 4 uses 0.10
- `backend/services/elliott_wave.js:150-151` — Wave 5 ratios at 0.15
- `backend/services/elliott_wave.js:212-214` — Wave C ratios at 0.15

---

## 5. Moving-average periods

| Constant | Value | Notes |
| --- | --- | --- |
| `MA_FAST_PERIOD` | **50** | Wave 2 confirmation MA |
| `MA_SLOW_PERIOD` | **200** | 200-day, 200-week, 200-month all use 200 periods |

**Citations:**
- `backend/scripts/seed_spec_documents.js:194-196` — "Must break AND hold above 50-day MA to confirm Wave 2"
- `backend/scripts/seed_spec_documents.js:212-214` — confluence support points: 50-day MA, 200-day MA, 200-week MA
- `backend/scripts/seed_doc_1_scoring.js:33` — "50-day MA confirms Wave 2"

---

## 6. Confluence-scoring weights

These come from `backend/services/scoring_config.js` `DEFAULTS` (the
runtime source). The SQL seed mirrors them in
`migration_sprint10c.sql`.

| Constant | Value | Citation |
| --- | --- | --- |
| `CONF_PREVIOUS_LOW` | 3 | scoring_config.js:26 |
| `CONF_ROUND_NUMBER` | 2 | scoring_config.js:27 |
| `CONF_50MA` | 3 | scoring_config.js:28 |
| `CONF_200MA` | 4 | scoring_config.js:29 |
| `CONF_200WMA` | 5 | scoring_config.js:30 |
| `CONF_FIB_0382` | 3 | scoring_config.js:31 |
| `CONF_FIB_050` | 4 | scoring_config.js:32 |
| `CONF_FIB_0618` | 5 | scoring_config.js:33 |
| `CONF_FIB_0786` | 4 | scoring_config.js:34 |
| `CONF_WAVE1_ORIGIN` | 5 | scoring_config.js:35 |
| `CONFLUENCE_ZONE_BONUS` | 15 | scoring_config.js:36 |
| `GENERATIONAL_BUY_BONUS` | 20 | scoring_config.js:37 |

`backend/services/scoring_config.js` exposes the same weights as a
Supabase-backed cache for the live system; the Stage-3 backtester uses
the static Python copies (these values rarely change and a backtest
must be reproducible by hash).

---

## 7. Wave-position scores

For computing the TLI score's Wave Position component (-15 to +30).

| Constant | Value | Wave |
| --- | --- | --- |
| `WAVE_SCORE_C_BOTTOM` | +30 | Wave C bottom (cycle reset) |
| `WAVE_SCORE_2_BOTTOM` | +25 | Wave 2 bottom (primary entry) |
| `WAVE_SCORE_4_SUPPORT` | +20 | Wave 4 holding support |
| `WAVE_SCORE_A_BOTTOM` | +15 | Wave A bottom (re-entry, fundamentals must pass) |
| `WAVE_SCORE_1_FORMING` | +10 | Wave 1 forming (early) |
| `WAVE_SCORE_3_IN_PROGRESS` | +5 | Wave 3 in progress |
| `WAVE_SCORE_5_IN_PROGRESS` | 0 | Wave 5 in progress (take-profit zone) |
| `WAVE_SCORE_B_BOUNCE` | -10 | Wave B bounce (exit liquidity) |
| `WAVE_SCORE_ENDING_DIAGONAL` | -15 | Ending diagonal in Wave 5 (TOP WARNING) |

**Citations:**
- `backend/scripts/seed_doc_1_scoring.js:25` — full list
- `backend/scripts/seed_spec_documents.js:247-255` — same

---

## 8. Action labels (score → label)

Total score (0-100) maps to an action label.

| Constant | Range | Label |
| --- | --- | --- |
| `LABEL_LOAD_THE_BOAT` | 85-100 | LOAD THE BOAT |
| `LABEL_ACCUMULATE` | 70-84 | ACCUMULATE |
| `LABEL_WATCHLIST` | 55-69 | WATCHLIST |
| `LABEL_HOLD` | 40-54 | HOLD |
| `LABEL_CAUTION` | 25-39 | CAUTION |
| `LABEL_TRIM` | 10-24 | TRIM |
| `LABEL_AVOID` | 0-9 | AVOID |

**Citations:**
- `backend/scripts/seed_doc_1_scoring.js:29` — single line
- `backend/scripts/seed_spec_documents.js:259-265` — full mapping

---

## 9. 5-tranche position sizing

| Tranche | Allocation | Trigger |
| --- | --- | --- |
| 1 | **10 %** | Price breaks out and holds support (Wave 1 confirmation) |
| 2 | **15 %** | Retest of support (Wave 2 bottom) |
| 3 | **20 %** | Moving up Wave 3 — sub-wave 2 |
| 4 | **25 %** | Continued Wave 3 — sub-wave 2 (add) |
| 5 | **30 %** | Reserve for unknowns — sudden pullback / retest |

Sum = 100 %.

**Citations:**
- `backend/scripts/seed_doc_1_scoring.js:35` — single line
- `backend/scripts/seed_spec_documents.js:311-315` — full breakdown
- Stage-2 `quant/docs/examples/hims_wave2_confluence.json` already encodes these as `entry_tranches`

---

## 10. Position-sizing modifiers (Spec section 8.3)

| Constant | Value | Trigger |
| --- | --- | --- |
| `VOLATILITY_HIGH_FACTOR` | **0.75** | Reduce size when volatility high |
| `CONVICTION_HIGH_FACTOR` | **1.15** | Slight increase when conviction very high |
| `PORTFOLIO_CONCENTRATION_WARN` | **0.15** | Warn when single position > 15 % of portfolio |
| `STOP_LOSS_PCT` | **0.15** | Default stop loss at -15 % |

**Citations:**
- `backend/scripts/seed_spec_documents.js:319` — volatility 0.75
- `backend/scripts/seed_spec_documents.js:320` — conviction 1.15
- `backend/scripts/seed_spec_documents.js:321` — concentration 0.15
- `backend/scripts/seed_spec_documents.js:326` — stop loss -15 %

---

## 11. Risk-filter thresholds

| Constant | Value | Citation |
| --- | --- | --- |
| `DOWNTREND_THRESHOLD` | **4** (of 8 signals) | scoring_config.js:44 |
| `CHASE_FILTER_PCT` | **20** (% above support) | scoring_config.js:45 |
| `EARNINGS_BLACKOUT_DAYS` | **14** | scoring_config.js:46 |
| `SENTIMENT_BOOST` | **5** | scoring_config.js:47 |

**Citations (runtime):**
- `backend/services/scoring_config.js:44-47` — all four risk parameters
- `backend/services/scorer.js:208-209` — earnings within 14 days → -15 pts
- `backend/pipeline/risk_filters.js:46` — earnings blackout 14 days
- `backend/scripts/seed_doc_1_scoring.js:39` — "Score >=4 suppresses all buys except GENERATIONAL"

---

## 12. Wave B retracement → corrective-pattern classification

Used to classify a corrective wave as Zigzag, Regular Flat, or
Expanded Flat by measuring how far Wave B retraces Wave A.

| Pattern | Wave B retracement of Wave A | Structure |
| --- | --- | --- |
| `WAVE_B_ZIGZAG_MAX` | < **0.618** | 5-3-5 |
| `WAVE_B_REGULAR_FLAT_RANGE` | **0.90 – 1.00** | 3-3-5 (the "FLAT TRAP") |
| `WAVE_B_EXPANDED_FLAT_MIN` | > **1.00** | 3-3-5 with deeper Wave C |

**Citations:**
- `backend/scripts/seed_spec_documents.js:115` — Zigzag (< 0.618)
- `backend/scripts/seed_spec_documents.js:117` — Regular Flat (0.90-1.00)
- `backend/scripts/seed_spec_documents.js:119` — Expanded Flat (> 1.00)
- `backend/scripts/seed_spec_documents.js:124` — Regular Flat Wave C targets 0.382-0.5 of prior impulse
- `backend/services/elliott_wave.js:205-208` — runtime classification using > 0.618 / > 0.886 thresholds

> **Note (Stage 3):** only the named pattern `wave_4_at_382` is
> implemented for Stage 3. Full corrective-family detection (zigzag,
> regular flat, expanded flat, triangle) is Stage 3.5.

---

## 13. Wave 2 entry confirmation

A price at the 0.618 Fib alone is **not** a Wave 2 entry signal. The
50-day MA must confirm.

| Condition | Outcome |
| --- | --- |
| price ≥ 0.618 fib support AND price > 50-day MA | `WAVE_2_ENTRY` |
| price ≥ 0.618 fib support AND price < 50-day MA | `WAVE_2_WATCH` (pending) |

**Citations:**
- `backend/scripts/seed_spec_documents.js:194-196` — full rule
- `backend/scripts/seed_spec_documents.js:282` — STATE 1 trigger

---

## 14. Elliott Wave hard rules (impulse validation)

| Rule | Condition | Citation |
| --- | --- | --- |
| 1 | `wave2_low > wave1_start` (Wave 2 never retraces 100 %) | spec 3.1:69; runtime elliott_wave.js:111 |
| 2 | `wave3_length >= wave1_length` OR `wave3_length >= wave5_length` (Wave 3 never the shortest) | spec 3.1:71; runtime elliott_wave.js:122 |
| 3 | `wave4_low > wave1_top` (Wave 4 cannot enter Wave 1 territory; standard / extended impulse only) | spec 3.1:73; runtime elliott_wave.js:119 |

`wave_4_at_382` enforces all three before firing. Diagonal patterns
(leading / ending) waive Rule 3 — out of scope for Stage 3.

---

## 15. Source-of-truth policy

- Stage 3 patterns import constants **from
  `simualpha_quant.tli_constants` only**. Hard-coding any of the
  values above outside that module is a code-review block.
- If a value is exposed as a tunable parameter on a pattern detector,
  the module-level constant remains the **default** the agent gets if
  it doesn't override.
- Discrepancies between the spec text and the runtime code should
  resolve in favor of runtime, with a note here.
- This document is updated whenever the runtime weights in
  `backend/services/scoring_config.js` change, or whenever the
  Stage-3 backtester adds a new TLI-derived constant.
