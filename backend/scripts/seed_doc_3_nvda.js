/**
const log = require('../services/logger').child({ module: 'seed_doc_3_nvda' });
 * seed_doc_3_nvda.js — NVDA Reference Chart Analysis
 *
 * Ingests the NVDA Elliott Wave calibration benchmark into the knowledge base.
 * This is the gold-standard reference chart for wave interpretation accuracy.
 *
 * Run: node backend/scripts/seed_doc_3_nvda.js
 */
require('dotenv').config();
const supabase = require('../services/supabase');
const { ingestDocument } = require('../services/ingest');

const SOURCE_NAME = 'NVDA Weekly Chart — Perfect Elliott Wave Reference';
const SOURCE_TYPE = 'TLI_METHODOLOGY';
const SOURCE_DATE = '2026-04-04';

const NVDA_REFERENCE_CHART = `
# NVDA Weekly Chart — Perfect Elliott Wave Execution
## Source: TradingView Weekly Chart, April 4, 2026
## Purpose: Calibration benchmark for all SimuAlpha wave interpretations

---

## WHY THIS CHART MATTERS

NVIDIA (NVDA) is the largest publicly traded company in the world and follows Elliott Wave Theory perfectly. Every wave, every Fibonacci level, every rule — confirmed. This chart is the proof that the methodology works on real equities at scale. Every future wave interpretation in SimuAlpha should be calibrated against this reference.

---

## COMPLETE WAVE COUNT

### Cycle Degree: Wave II Bottom (2022)

Wave II bottomed with a corrective ABC structure at approximately $10-12 in late 2022. This was the generational entry point — the reset of the entire cycle. From this bottom, a new 5-wave impulse began.

### Primary Wave 1: Impulse Up

Wave 1 impulse began from the Wave II bottom. Sub-waves 1-2-3-4-5 are clearly visible on the weekly chart. This established the initial trend direction and measured the base move that all subsequent Fibonacci calculations reference.

### Primary Wave 2: The Entry Zone

Wave 2 pulled back in a textbook 3-wave ABC corrective structure to the 0.618 Fibonacci retracement level at $13.36. This was the PRIMARY TLI entry point — the highest-conviction buy zone in the entire Elliott Wave cycle. The pullback was confirmed by price breaking and holding above the 50-day moving average, which is the required confirmation trigger per the TLI methodology (price at 0.618 Fib alone is NOT sufficient — must also hold above 50-day MA).

Key levels at Wave 2:
- 0.500 Fibonacci: upper bound of buy zone
- 0.618 Fibonacci: $13.36 — exact bottom of Wave 2
- 50-day MA confirmation: price held above after touching 0.618

### Primary Wave 3: The Monster Move

Wave 3 executed a perfect 5-wave impulse sub-structure, hitting the 2.618 Fibonacci extension at $142.48. This was an Extended Wave 3 — the wave exceeded the standard 1.618 extension target because of a powerful fundamental catalyst (AI/GPU revolution, data center buildout, CUDA monopoly).

Extended Wave 3 characteristics confirmed:
- Wave 3 length >> 1.618x Wave 1 height (hit 2.618x)
- Volume surging throughout the move
- Fundamental catalyst present (AI/GPU secular trend)
- Sub-wave structure shows clear 5-wave impulse

Per TLI methodology, when an Extended Wave 3 is detected, the Wave 3 target should be widened from 1.618 to 2.618. Wave 4 pullback after an extended Wave 3 may be deeper and longer than normal.

The 1.618 extension level ($142.48 area) was the TRIM target — where the methodology calls for taking partial profits (50% of position).

### Primary Wave 4: The Add Zone

Wave 4 corrected in a textbook 3-wave ABC structure and held precisely at the 0.382 Fibonacci retracement of Wave 3 at $98.34. This was the ADD zone — where the methodology calls for adding to the winning position (tranche 4 of the 5-part entry system).

Critical validation: Wave 4 did NOT enter Wave 1 territory. The Wave 4 low of $98.34 remained above the Wave 1 top at $81.64. This confirms Hard Rule 3 (Wave 4 cannot overlap Wave 1 price territory in a standard impulse).

Key levels at Wave 4:
- 0.382 Fibonacci of Wave 3: $98.34 — exact Wave 4 bottom
- Wave 1 top: $81.64 — Wave 4 stayed above this (rule confirmed)

### Primary Wave 5: The Exhaustion Zone

Wave 5 completed near the 1.0 Fibonacci extension target at $216.31. This is the TAKE PROFIT zone — where the methodology calls for exiting the remaining position or taking up to 50% profit. Wave 5 targets range from 1.0 to 2.618 extension of Wave 1 measured from Wave 4 low.

Signs of Wave 5 exhaustion to watch for:
- Parabolic price acceleration
- Ending diagonal pattern (3-3-3-3-3 wedge structure)
- Volume divergence (price rising on declining volume)
- RSI/MACD negative divergence

### Current Position: Cycle V Correction

NVDA is now in a Cycle V correction — an ABC corrective structure targeting the 200-week moving average and key Fibonacci retracement levels of the entire impulse from Wave II bottom to Wave 5 top.

Corrective targets (from entire impulse):
- 0.382 Fibonacci: $131.16 — first support level
- 0.500 Fibonacci: $106.13 — primary correction target, near 200 WMA convergence
- 0.618 Fibonacci: $81.11 — deep correction target, near Wave 1 origin

Current price: $177.39 (as of April 4, 2026).

If price reaches the 0.500 Fibonacci ($106.13) AND the 200-week moving average converges at that level (within 3%), this triggers the CONFLUENCE ZONE signal — the highest-conviction buy signal in the TLI methodology (+15 bonus points, gold border badge). This would represent the Wave C bottom and a full cycle reset entry.

If price reaches the 0.618 Fibonacci ($81.11) AND Wave 1 origin AND 200-month moving average converge within 15%, this triggers the GENERATIONAL SUPPORT ZONE signal — the maximum conviction signal (+20 bonus points, electric blue badge).

---

## THREE HARD RULES — ALL CONFIRMED

This chart validates all three universal Elliott Wave hard rules that apply to every impulse pattern:

RULE 1 CONFIRMED: Wave 2 ($13.36) never retraced below Wave 1 start (~$10-12). Wave 2 retracement stayed within the 0.618 Fibonacci level of Wave 1. If this rule had been violated, the count would be invalid and the structure would need reclassification as corrective, not impulsive.

RULE 2 CONFIRMED: Wave 3 ($142.48 at 2.618 extension) was the longest wave — not the shortest of Waves 1, 3, and 5. Wave 3 can be shorter than one of the other motive waves, but it can NEVER be shorter than both. In NVDA's case, Wave 3 was by far the longest (Extended Wave 3), driven by the AI fundamental catalyst.

RULE 3 CONFIRMED: Wave 4 ($98.34) did not enter Wave 1 territory (Wave 1 top at $81.64). The gap between Wave 4 low ($98.34) and Wave 1 top ($81.64) was $16.70, providing clear separation. If Wave 4 had overlapped Wave 1, the pattern would need to be checked for diagonal classification before invalidating.

---

## FIBONACCI LEVELS — COMPLETE TABLE

All Fibonacci calculations for NVDA based on the measured wave heights:

Wave 2 Entry Zone:
- 0.500 Fib of Wave 1: upper buy zone boundary
- 0.618 Fib of Wave 1: $13.36 — primary entry (confirmed)

Wave 3 Targets:
- 1.618 extension of Wave 1 from Wave 2 low: standard target (TRIM point)
- 2.618 extension of Wave 1 from Wave 2 low: $142.48 — extended target (confirmed)

Wave 4 Pullback:
- 0.382 Fib of Wave 3: $98.34 — ADD zone (confirmed)

Wave 5 Targets:
- 1.0 extension of Wave 1 from Wave 4 low: $216.31 — base target (confirmed)
- 2.618 extension of Wave 1 from Wave 4 low: maximum extension target

Cycle V Correction Targets:
- 0.382 Fib of entire impulse (W2 low to W5 top): $131.16
- 0.500 Fib of entire impulse: $106.13 — primary re-entry target
- 0.618 Fib of entire impulse: $81.11 — deep value / generational zone

---

## CHARTING LEGEND

The TradingView chart uses the following visual conventions that match the TLI specification:

- Blue line: 50-period Simple Moving Average (50 SMA) — used for Wave 2 confirmation trigger
- Yellow line: 200-period Simple Moving Average (200 SMA) — key support/resistance level
- Green circles: Impulse wave labels (Waves 1, 3, 5 — motive waves moving in trend direction)
- Red circles: Corrective wave labels (Waves 2, 4, A, B, C — counter-trend moves)
- Fibonacci levels drawn from wave origin to wave terminus with percentage labels

This visual convention should be consistent across all SimuAlpha chart interpretations.

---

## CALIBRATION RULES FOR FUTURE INTERPRETATIONS

This NVDA chart establishes the calibration standard. When interpreting any future stock's Elliott Wave structure, verify against these benchmarks:

1. Wave 2 should retrace to the 0.500-0.618 Fibonacci zone of Wave 1. NVDA confirmed 0.618 exactly.
2. Wave 3 should target at minimum 1.618 extension. NVDA hit 2.618 (extended). If fundamental catalyst is present, extend target.
3. Wave 4 should retrace to 0.382 Fibonacci of Wave 3. NVDA confirmed 0.382 exactly.
4. Wave 5 should target 1.0 extension of Wave 1 from Wave 4 low. NVDA confirmed 1.0.
5. Corrective ABC structures should target 0.500-0.618 Fibonacci of the entire prior impulse.
6. 50-day MA must be used as confirmation trigger — Fibonacci level alone is insufficient.
7. All three hard rules must be checked before accepting any impulse count as valid.
8. Volume should increase during motive waves and decrease during corrective waves.
9. Extended Wave 3 requires both volume surge AND fundamental catalyst to be classified.
10. The highest-conviction entry occurs when 200WMA + 0.618 Fib converge within 3% (CONFLUENCE ZONE).

Any wave interpretation that produces levels inconsistent with these observed ratios should be flagged for review. NVDA is the proof — the math works.
`;

async function main() {
  log.info('═══════════════════════════════════════════');
  log.info('Seeding NVDA Reference Chart Analysis');
  log.info('═══════════════════════════════════════════\n');

  // Step 1: Clear existing chunks for this source name
  log.info(`[seed_doc_3] Clearing existing chunks for "${SOURCE_NAME}"...`);
  const { error: delError, count } = await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('source_name', SOURCE_NAME);

  if (delError) {
    log.error('[seed_doc_3] Delete error:', delError.message);
  } else {
    log.info(`[seed_doc_3] Cleared ${count ?? 'unknown'} existing chunks.`);
  }

  // Step 2: Ingest the document
  log.info(`[seed_doc_3] Ingesting "${SOURCE_NAME}"...`);
  const result = await ingestDocument({
    text: NVDA_REFERENCE_CHART,
    sourceName: SOURCE_NAME,
    sourceType: SOURCE_TYPE,
    sourceDate: SOURCE_DATE,
  });

  log.info(`\n═══════════════════════════════════════════`);
  log.info(`NVDA Reference Chart: ${result.chunks_stored}/${result.chunks_total} chunks stored`);
  log.info('═══════════════════════════════════════════');
}

module.exports = main;

if (require.main === module) {
  main().catch(err => {
    log.error('[seed_doc_3] FAILED:', err.message);
    process.exit(1);
  });
}
