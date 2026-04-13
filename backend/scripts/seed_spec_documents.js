/**
 * seed_spec_documents.js — Seeds the knowledge base with full TLI methodology documents
 *
 * Ingests the TLI master specifications into the knowledge base so
 * every skill call can retrieve calibrated, on-methodology context.
 *
 * Run once: node backend/scripts/seed_spec_documents.js
 * These are the COMPLETE documents, not summaries.
 *
 * Override via environment variables:
 *   TLI_SPEC_PATH        — file path to TLI Scoring Algorithm v1.0
 *   FUND_SPEC_PATH       — file path to Fundamental Analysis Master
 */

const log = require('../services/logger').child({ module: 'seed_spec_documents' });
const fs = require('fs');
const path = require('path');
const { ingestDocument } = require('../services/ingest');

// ─── SPEC 1: TLI Scoring Algorithm v1.0 — COMPLETE TEXT ───
// Source: All TLI Lessons, FAQ, and Strategy Documents
// If a file path is provided via TLI_SPEC_PATH env var, it will be loaded instead.
const TLI_SCORING_SPEC = `
# SimuAlpha — TLI Scoring Algorithm Specification v1.0
## Source: All TLI Lessons, FAQ, and Strategy Documents (Extracted April 2026)

---

## 1. ARCHITECTURE OVERVIEW

The scoring engine has four layers that run sequentially:

Layer 1: FUNDAMENTAL SCREEN — Is this stock worth buying at all?
Layer 2: WAVE CLASSIFICATION — Where is it in the Elliott Wave cycle?
Layer 3: FIBONACCI TARGETING — What are the calculated price levels?
Layer 4: CONFLUENCE SCORING — How many signals align? What's the conviction?

Each stock receives a total TLI Score (0-100) that maps to an action label.

---

## 2. LAYER 1 — FUNDAMENTAL SCREEN (Pass/Fail + Score 0-30)

### Pass Requirements (all must be true to proceed):
revenue_growth > 0 — Not declining
gross_margin_trend != "contracting" — Not deteriorating
debt_service_ratio >= 1.5 — Can service debt
guidance != "lowered" — Not guiding down
insider_selling != "heavy" — Management not dumping

If ANY fail, stock is disqualified, no further scoring.

### Fundamental Score (0-30 pts):
Revenue growth accelerating: +5
Gross margin expanding: +5
Positive free cash flow: +5
Low debt / strong balance sheet: +5
Large TAM remaining: +5
Competitive moat / market leader: +5

---

## 3. LAYER 2 — WAVE CLASSIFICATION ENGINE

### 3.1 Three Universal Hard Rules (Impulse Validation)

These apply to ALL four impulse patterns. If violated, count is invalid, reclassify.

RULE 1: wave2_low > wave1_start — Wave 2 never retraces 100% of Wave 1. If violated, still in corrective wave, not impulse.

RULE 2: wave3_length >= wave1_length OR wave3_length >= wave5_length — Wave 3 is never the shortest of 1, 3, 5. Can be shorter than one, but not both.

RULE 3: wave4_low > wave1_top [STANDARD IMPULSE / EXTENDED ONLY] — Wave 4 cannot enter Wave 1 territory. If violated, check for diagonal pattern before invalidating.

### 3.2 Four Impulse Pattern Types

Normal Impulse: Any motive position, 5-3-5-3-5 sub-wave structure, NO W4/W1 overlap, standard rules hold.
Extended Wave: Usually Wave 3, 9-wave (5-in-5), NO overlap, W3 >> 1.618x W1 with high volume and fundamental catalyst.
Leading Diagonal: Wave 1 or A only, 5 waves in wedge, YES overlap allowed, converging trendlines at trend START.
Ending Diagonal: Wave 5 or C only, 3-3-3-3-3 in wedge, YES overlap allowed, converging trendlines at trend END = REVERSAL WARNING.

### 3.3 Overlap Branch Logic

If wave4 enters wave1 territory:
  If position is wave_1 or wave_A:
    If trendlines converging and subwaves are 3-wave: classify as LEADING_DIAGONAL (new trend starting)
    Else: INVALID
  If position is wave_5 or wave_C:
    If trendlines converging and subwave structure is 3-3-3-3-3: classify as ENDING_DIAGONAL (trend exhaustion, TOP WARNING)
    Else: INVALID
  Else: INVALID — count is wrong, reclassify

### 3.4 Sub-Wave Counting (Fractal Verification)

The single most important discriminator: does a move subdivide into 3 or 5 waves?

Motive Phase (Impulse) = 5-3-5-3-5:
  Wave 1: 5 sub-waves (impulse)
  Wave 2: 3 sub-waves A-B-C (corrective)
  Wave 3: 5 sub-waves (impulse)
  Wave 4: 3 sub-waves A-B-C (corrective)
  Wave 5: 5 sub-waves (impulse)

Corrective Phase (Zigzag) = 5-3-5:
  Wave A: 5 sub-waves (impulse down)
  Wave B: 3 sub-waves (corrective bounce)
  Wave C: 5 sub-waves (impulse down)

Validation rule: If a suspected Wave 3 move only has 3 sub-waves, it's corrective (Wave B), not impulsive. If a suspected Wave 2 decline has 5 sub-waves, it may be Wave A of a larger correction.

### 3.5 Corrective Pattern Classification

Classify early by measuring Wave B retracement of Wave A:

If wave_B_retracement < 0.618: correction_type = ZIGZAG (Structure: 5-3-5). Deeper Wave C likely, targets 0.618 of prior impulse.

If 0.90 <= wave_B_retracement <= 1.00: correction_type = REGULAR_FLAT (Structure: 3-3-5). Wave B bounces to near double-top then Wave C drops below Wave A. THE FLAT TRAP: 3-wave decline looks complete, 3-wave bounce looks bullish, but it's Wave B and Wave C impulse down is coming.

If wave_B_retracement > 1.00: correction_type = EXPANDED_FLAT. Even deeper Wave C.

Regular Flat Hard Rules:
1. Wave B retraces 90-100% of Wave A (not beyond 100%)
2. Wave C must end below Wave A terminus
3. Wave C targets 0.382-0.5 Fib of prior impulse

Corrective Validation Rules:
1. Wave B never retraces >100% of Wave A (in zigzag)
2. Wave C = strongest wave in corrective pattern
3. Wave A and Wave C should not overlap in price (in zigzag)

### 3.6 The Flat Trap Detector

After any 3-wave decline from a Wave 5 top:
Flag two competing scenarios:
scenario_1 = CORRECTION_COMPLETE (if bounce is 5 waves, impulse)
scenario_2 = FLAT_IN_PROGRESS (if bounce is 3 waves, corrective)

Count bounce structure:
If bounce_wave_count == 5: signal = NEW_BULL_LEG (Wave 4 complete, new impulse)
If bounce_wave_count == 3: signal = FLAT_CORRECTION_WARNING (Wave B, expect Wave C down). Monitor 50 WMA as confirmation/rejection level. Wave B near double-top + 3-wave structure = high probability Flat.

### 3.7 Downtrend Detection Filter (Bearish Score 0-8)

Before issuing ANY buy signal, check the downtrend score:

+1 if: Series of Lower Highs + Lower Lows
+1 if: Breaking down through successive Fib supports
+1 if: Prior supports failing (break, retest, reject)
+1 if: Price in downward-sloping parallel trendlines (channel)
+1 if: Brief upward consolidation within larger downtrend (flag pattern)
+1 if: Increasing volume on sell-offs, declining on bounces
+1 if: Price below 50-day AND 200-day MA, both sloping down
+1 if: 50-day crosses below 200-day (death cross)

If downtrend_score >= 4: suppress_all_buy_signals = True. Exception: only surface if GENERATIONAL_SUPPORT_ZONE reached.
If downtrend_score is decreasing: flag = POTENTIAL_WAVE_1_FORMING (early trend reversal detection).

---

## 4. LAYER 3 — FIBONACCI PRICE TARGET ENGINE

### 4.1 Core Formulas

wave1_height = wave1_top - wave1_start

Entry levels:
wave2_target = wave1_top - (wave1_height * 0.618) — Buy zone
wave2_range = (wave1_top - wave1_height * 0.5, wave1_top - wave1_height * 0.618) — 0.5-0.618 range

Wave 3 target:
wave3_target = wave2_low + (wave1_height * 1.618)

Wave 4 pullback:
wave3_height = wave3_top - wave2_low
wave4_target = wave3_top - (wave3_height * 0.382)

Wave 5 target:
wave5_target_base = wave4_low + wave1_height — 1.0 extension
wave5_target_extended = wave4_low + (wave1_height * 2.618) — Max extension

Corrective targets:
wave_C_target = wave5_top - ((wave5_top - wave1_start) * 0.618)

### 4.2 Wave-Specific Fib Levels

Wave 2: 0.5-0.618 of Wave 1 = BUY ZONE
Wave 3: 1.618 x Wave 1 from Wave 2 low = TRIM target
Wave 4: 0.382 of Wave 3 = ADD zone
Wave 5: 1.0-2.618 x Wave 1 from Wave 4 low = TAKE PROFIT
Wave C: 0.5-0.618 of entire impulse = RE-ENTRY zone

### 4.3 50-Day MA as Wave 2 Confirmation Trigger

Price at 0.618 Fib alone is NOT sufficient. Must break AND hold above 50-day MA to confirm Wave 2 complete.
If price >= fib_0618_support AND price > ma_50_day: wave2_confirmed = True, signal = WAVE_2_ENTRY
If price >= fib_0618_support AND price < ma_50_day: wave2_pending = True, signal = WAVE_2_WATCH (at Fib but not yet confirmed)

### 4.4 Bull/Bear Bifurcation Level

For each stock, identify the price level that separates bull case from bear case. Above it = impulse continuation. Below it = corrective structure.

---

## 5. LAYER 4 — CONFLUENCE SCORING (0-40 pts)

### 5.1 Support Identification Stack

Each support type present at current price level = conviction points:

Previous price low: +3
Round number: +2
50-day MA: +3
200-day MA: +4
200-week MA: +5
Fib 0.382: +3
Fib 0.5: +4
Fib 0.618: +5
Fib 0.786: +4
Wave 1 origin: +5

### 5.2 Special Confluence Bonuses

CONFLUENCE ZONE: 200WMA + 0.618 Fib within 3%. If current price near that level: bonus += 15, badge = CONFLUENCE_ZONE (highest conviction).

GENERATIONAL SUPPORT ZONE: 0.786 Fib + Wave 1 origin + 200MMA within 15%. If current price near that zone: bonus += 20, badge = GENERATIONAL_BUY (electric blue badge).

### 5.3 Support Confirmation Types

Type 1 V-Shape Bounce: sharp drop to support AND full recovery within 3 candles AND volume spike. confidence_boost = +5
Type 2 Base-Building Consolidation: support touches >= 3 AND ascending lows AND impulse wave forming. confidence_boost = +5

### 5.4 Secondary Confirmation Signals

Volume increasing on bounce: +2
Bullish candlestick at support (hammer, engulfing): +2
RSI bullish divergence: +2
MACD bullish divergence: +2

---

## 6. TOTAL SCORE — ACTION LABEL MAPPING

TOTAL SCORE = Fundamental (0-30) + Wave Position (0-30) + Confluence (0-40)

### 6.1 Wave Position Score (0-30 pts)

Wave C bottom (cycle reset): +30 — Maximum conviction re-entry
Wave 2 bottom (initial entry): +25 — Primary buy zone
Wave 4 holding support: +20 — Add to winner
Wave A bottom (re-entry): +15 — Only if fundamentals pass
Wave 1 forming: +10 — Early, unconfirmed
Wave 3 in progress: +5 — Hold only, don't chase
Wave 5 in progress: +0 — Take profit zone
Wave B bounce: -10 — Exit liquidity, DO NOT BUY
Ending diagonal in Wave 5: -15 — TOP WARNING

### 6.2 Action Labels

85-100: LOAD THE BOAT — Maximum conviction buy (deep green)
70-84: ACCUMULATE — Strong buy, scale in (green)
55-69: WATCHLIST — Bullish setup, not yet entry (yellow)
40-54: HOLD — Already positioned, maintain (blue)
25-39: CAUTION — Elevated risk, reduce exposure (orange)
10-24: TRIM — Take profits, de-risk (light red)
0-9: AVOID — No setup, wrong position in cycle (red)

### 6.3 Special Badges (override display)

CONFLUENCE ZONE: 200WMA + 0.618 Fib within 3% at price = Gold border
GENERATIONAL BUY: 0.786 + W1 origin + 200MMA within 15% = Electric blue
ENDING DIAGONAL TOP: Ending diagonal in W5 or W(C) = Red flash
FLAT CORRECTION WARNING: 3-wave bounce after 3-wave decline = Orange alert
EXTENDED WAVE 3: W3 >> 1.618x, fundamental catalyst = Green pulse
EARNINGS PROXIMITY: Earnings within 14 days of buy zone = Yellow caution

---

## 7. THE MASTER TRADE CYCLE (State Machine)

The engine tracks each stock through 8 states with corresponding signals:

STATE 1 WAVE_2_ENTRY: Trigger = Price at 0.5-0.618 Fib + holds above 50-day MA. Action = BUY (1st + 2nd tranche of 5-part system). Display = Wave 3 price target.

STATE 2 WAVE_3_IN_PROGRESS: Trigger = Price moving up in 5-wave sub-structure. Action = HOLD + ADD (3rd + 4th tranche in sub-wave 2). Display = Wave 3 target at 1.618.

STATE 3 WAVE_3_TARGET_HIT: Trigger = Price reaches 1.618 extension. Action = TRIM profits. Display = Wave 4 pullback level at 0.382.

STATE 4 WAVE_4_SUPPORT_HOLD: Trigger = Price at 0.382 Fib of Wave 3, holding support. Action = ADD position. Display = Wave 5 target.

STATE 5 WAVE_5_EXHAUSTION: Trigger = Parabolic move, ending diagonal, volume divergence. Action = TAKE up to 50% profit. Display = Corrective targets.

STATE 6 WAVE_A_BOTTOM: Trigger = Wave A completes 5-wave decline. Action = RE-ENTER (only if fundamentals still pass). Display = Wave B bounce target.

STATE 7 WAVE_B_REJECTION: Trigger = 3-wave bounce rejects at/near prior high. Action = TRIM profits. Display = Wave C target at 0.618.

STATE 8 WAVE_C_BOTTOM: Trigger = Price at 0.5-0.618 Fib of entire impulse. Action = RESTART CYCLE (full position rebuild). Display = New Wave 1 target.

Continuous check at every state: fundamentals_still_pass() — if fundamentals deteriorate at any point, exit. Do not re-enter at Wave A/C.

---

## 8. POSITION SIZING MODULE

### 8.1 Core Formula

max_risk = portfolio_value * risk_tolerance (1-2%)
position_size = max_risk / stop_loss_pct (typically 10-15%)

### 8.2 The 5-Part Entry System (Maps to Wave Cycle)

Tranche 1 (10%): Price breaks out and holds support — Wave 1 confirmation
Tranche 2 (15%): Retest of support — Wave 2 bottom
Tranche 3 (20%): Moving up Wave 3 — sub-wave 2
Tranche 4 (25%): Continued Wave 3 — sub-wave 2 (add)
Tranche 5 (30%): Reserve for unknowns — sudden pullback / retest

### 8.3 Position Sizing Modifiers

If volatility high: position_size *= 0.75 (reduce for volatile names)
If conviction very_high: position_size *= 1.15 (slight increase, stay within risk params)
If portfolio_concentration > 0.15: WARN (single position exceeds 15% of portfolio)

### 8.4 Non-Negotiable Rules

Add to winners only, never losers — suppress add signals for positions in drawdown
If using stop-losses: set at -15%, NOT -10% (avoid market maker stop raids)
No chasing, no shorting, no options, no leverage, no meme stocks
Never trade earnings

---

## 9. RISK FLAGS & OVERRIDES

### 9.1 Earnings Proximity Flag

If days_to_earnings <= 14 AND stock in buy zone: flag = EARNINGS_PROXIMITY. Do NOT suppress signal, but display caution badge. Note: Consider waiting for post-earnings confirmation.

### 9.2 Ending Diagonal Detection

If wave_position == wave_5 AND pattern == ending_diagonal: override_signal = ENDING_DIAGONAL_TOP. Sharp reversal imminent. Retraces to at minimum Wave 1 origin of the diagonal. suppress_buy_signals = True.

### 9.3 Extended Wave Detection

If wave3_length > wave1_height * 2.0 AND volume_surging AND fundamental_catalyst: flag = EXTENDED_WAVE_3. Widen Wave 3 target from 1.618 to 2.618. Wave 4 pullback may be deeper/longer than normal.

### 9.4 Black Swan Protection (Portfolio Level)

Maintain Safe Haven allocation.
Cap high-risk positions at smaller portfolio percentage.
Portfolio health score based on diversification + safe haven ratio.

---

## 10. SIGNAL TYPES (Complete List)

WAVE_2_ENTRY: Price at 0.5-0.618 Fib, 50MA confirmed — BUY
WAVE_3_IN_PROGRESS: 5-wave impulse up from Wave 2 — HOLD
WAVE_3_TARGET_HIT: Price at 1.618 extension — TRIM
WAVE_4_SUPPORT_HOLD: Price at 0.382 of W3, holding — ADD
WAVE_5_EXHAUSTION: Parabolic move / ending diagonal — TAKE 50%
WAVE_A_BOTTOM: Wave A 5-wave decline complete — RE-ENTER (if fundamentals pass)
WAVE_B_REJECTION: 3-wave bounce rejects near prior high — TRIM
WAVE_C_BOTTOM: Price at 0.618 of entire impulse — FULL RESET
FLAT_CORRECTION_WARNING: 3-wave bounce after 3-wave decline — CAUTION
FLAT_CORRECTION_C_BOTTOM: Wave C of confirmed Flat at Fib support — BUY
ENDING_DIAGONAL_TOP: 3-3-3-3-3 wedge in W5/WC position — SELL/TRIM
EXTENDED_WAVE_POSSIBLE: W3 >> 1.618x + catalyst — HOLD TIGHT
CONFLUENCE_ZONE: 200WMA + 0.618 Fib within 3% — MAX BUY
GENERATIONAL_SUPPORT: 0.786 + W1 origin + 200MMA converging — MAX BUY
LEADING_DIAGONAL: Converging wedge at trend start, W4/W1 overlap — EARLY BUY
DOWNTREND_ACTIVE: Bearish score >= 4/8 — AVOID

---

## 11. UI LANGUAGE RULES

SimuAlpha must NEVER say BUY or SELL directly.

Use instead:
Entering buy zone / Approaching support
Trim zone reached / Target achieved
Watchlist setup detected
Confluence zone active

This mirrors TLI's no-financial-advice stance and provides regulatory protection.

---

## 12. MULTI-TIMEFRAME ANALYSIS

PRIMARY DEGREE (Monthly chart + 200 MMA): Where is the stock in its multi-year lifecycle? Sets WHAT to buy.
INTERMEDIATE DEGREE (Weekly chart + 200 WMA): Where specifically within the primary structure? Sets WHEN to buy.

Both run simultaneously. Monthly context + Weekly entry = full signal.
`;

// ─── SPEC 2: Fundamental Analysis Engine Master Prompt ───
const FUNDAMENTAL_ANALYSIS_SPEC = `
<<< FUNDAMENTAL ANALYSIS ENGINE — MASTER PROMPT — BEGIN >>>

SIMUALPHA FUNDAMENTAL ANALYSIS ENGINE — MASTER PROMPT

THREE-PILLAR VALUATION:
1. DCF (10-year projection, terminal value, maturity-tuned WACC)
2. EV / Sales (forward, sector-adjusted)
3. EV / EBITDA (forward, sector-adjusted)

MATURITY PROFILES (5 classes):
- DEFENSIVE_LOW_RISK (KO, NESN):    WACC 6%, terminal 2%, FCF growth 3%
- MATURE_STABLE (AAPL, V, UNH):     WACC 7%, terminal 2.5%, FCF growth 4-6%
- LARGE_CAP_WITH_RISK (PFE, LVMH):  WACC 7.5%, terminal 2.5%, FCF growth 4%
- HIGH_GROWTH_MONOPOLY (NVDA, ASML):WACC 8%, terminal 3%, FCF growth 15-25%
- CYCLICAL_FX_EXPOSED (OXY, HOOD):  WACC 9%, terminal 2%, FCF growth 0-5%

DCF EXCLUSION RULE:
If DCF diverges >20% from the multiples average, exclude DCF and rely on multiples.
Record dcfExclusionReason and reduce method agreement to MEDIUM.

METHOD AGREEMENT SCORE:
- HIGH (std dev <5%): all 3 methods agree within 5% — highest conviction
- MEDIUM (5-15%): methods somewhat divergent
- LOW (>15%): methods diverge substantially — reduce conviction

TOTAL RETURN (Siegel):
Total Return = Price Upside + Dividend Yield
Income plays (>3% yield + low upside) flagged as IS_INCOME_PLAY.

LYNCH 6 CATEGORIES:
- Fast Grower (EPS ≥20%, sustainable)     — Hold 3-5y, allocation 5-7%
- Stalwart (EPS 10-19%, $5B+ cap)         — Hold 3-5y, 4-6%
- Slow Grower (EPS 2-9%, dividend payer)  — Hold 3-5y, 3-5%
- Cyclical (sector-driven earnings)       — Hold through cycle, 4-6%
- Turnaround (prior negative → positive)  — Hold 2-4y, 3-5%
- Unclassified (insufficient data)        — Monitor only

LYNCH MIGRATION DETECTION:
Fast Grower → Stalwart when EPS growth decelerates from >20% to 10-19% for 2+ qtrs.
Triggers partial trim: 20% reduction, re-enter if re-accelerates.

RATING ENGINE (5 bands + 4 overrides):
Base bands from composite upside:
- STRONG_BUY >30%, BUY >10%, NEUTRAL >-5%, REDUCE >-20%, SELL ≤-20%

Overrides:
1. Quality Floor: moat score ≥4 upgrades SELL→NEUTRAL (never sell wide moat)
2. Opportunity Cost: if total return <8%, cap rating at NEUTRAL
3. Declining Fundamentals: revenue+EBITDA both declining → cap at NEUTRAL
4. Leverage Penalty: Debt/EBITDA >4 → downgrade one band

KILL THESIS FLAGS (Munger inversion, 8 flags):
1. PATENT_CLIFF within 3 years
2. REGULATORY_ACTION pending
3. TARIFF_EXPOSURE >20% of revenue
4. EXCESSIVE_DEBT (D/E >3 AND FCF margin <5%)
5. DATA_BREACH in last 12 months
6. KEY_PERSON_RISK (CEO/founder departure)
7. ACCOUNTING_ALLEGATIONS
8. EARNINGS_MANIPULATION (GAAP non-GAAP divergence >20%)

3+ flags = forceDowngrade from BUY/STRONG_BUY to NEUTRAL.

MARGIN OF SAFETY (Graham):
MoS = (Intrinsic Value - Current Price) / Intrinsic Value × 100
- >15% STRONG_MOS — full tranches
- 10-15% ADEQUATE_MOS — scaled tranches
- <10% INSUFFICIENT_MOS — no new entries

MULTIPLE COMPRESSION DETECTOR:
Compare current EV/Sales vs 5-year average:
- <-30% with positive revenue growth → DEEP_VALUE
- <-30% with flat/negative growth → VALUE_TRAP
- >+30% → OVERVALUED (multiple expansion risk)

EPS-REVENUE COHERENCE CHECK:
If EPS growing but revenue flat/declining for 2+ quarters → manipulation flag.

HIDDEN VALUE PATTERN (UNH):
FCF rising while EPS flat → accounting conservatism, upside surprise likely.

FUNDAMENTAL GATE:
Hard-pass criteria that must be true for any BUY/ACCUMULATE signal:
- Revenue growth ≥ 0 (no collapse)
- Gross margin not declining >500bps YoY
- Operating leverage positive (EBITDA growing ≥ revenue growth)
- Share count not expanding >3%/yr (no mass dilution)

LANGUAGE RULES (carried from TLI spec):
Use "entering accumulation zone", "approaching support", "trim zone reached",
"target achieved", "watchlist setup detected", "confluence zone active".
NEVER say "buy" or "sell" directly.

<<< FUNDAMENTAL ANALYSIS ENGINE — MASTER PROMPT — END >>>
`;

// ─── SPEC 3: NVDA Reference Chart ───
const NVDA_WAVE_ANALYSIS = `
NVDA weekly chart — perfect Elliott Wave execution. Reference chart.

Wave II bottomed at ~$10-12 (2022). Wave 1 impulse with subwaves visible.
Wave 2 pulled back in 3 waves ABC to 0.618 Fib at $13.36 — primary entry.
Wave 3 ran perfect 5-wave impulse, hit 2.618 extension at $142.48.
Wave 4 corrected in 3 waves, held precisely at 0.382 Fib at $98.34.
Wave 5 completed near 1.0 Fib target at $216.31.
Now in Cycle V correction — ABC targeting 200 WMA and 0.5 Fib at $106.13.

All 3 hard rules confirmed:
- Wave 2 never below Wave 1 start
- Wave 3 longest of 1/3/5
- Wave 4 never overlapped Wave 2 territory

Charting legend matches TLI spec. This is the benchmark chart for wave
interpretation accuracy — use it as the calibration standard for all
future Elliott Wave interpretations.

Key Fibonacci levels observed:
- 0.618 Fib = $13.36 (Wave 2 low)
- 2.618 ext = $142.48 (Wave 3 target)
- 0.382 Fib of W3 = $98.34 (Wave 4 pullback)
- 1.0 Fib ext = $216.31 (Wave 5 top)
- 0.5 Fib correction target = $106.13 (Cycle V target)
`;

/**
 * Load spec text from file path or fall back to embedded default.
 */
function loadSpec(envVar, fallback) {
  const p = process.env[envVar];
  if (p && fs.existsSync(p)) {
    log.info({ envVar, path: p }, 'Loading spec from file');
    return fs.readFileSync(p, 'utf8');
  }
  return fallback;
}

async function seedSpecs() {
  const tliSpec = loadSpec('TLI_SPEC_PATH', TLI_SCORING_SPEC);
  const fundSpec = loadSpec('FUND_SPEC_PATH', FUNDAMENTAL_ANALYSIS_SPEC);

  log.info('Seeding TLI Scoring Algorithm v1.0');
  const r1 = await ingestDocument({
    text: tliSpec,
    sourceName: 'TLI Scoring Algorithm v1.0 — Complete Technical Specification',
    sourceType: 'TLI_METHODOLOGY',
    sourceDate: '2026-04-01',
  });
  log.info({ chunksStored: r1?.chunks_stored, chunksTotal: r1?.chunks_total }, 'TLI spec stored');

  log.info('Seeding Fundamental Analysis Engine Master Prompt');
  const r2 = await ingestDocument({
    text: fundSpec,
    sourceName: 'SimuAlpha Fundamental Analysis Engine — Master Prompt',
    sourceType: 'TLI_METHODOLOGY',
    sourceDate: '2026-04-01',
  });
  log.info({ chunksStored: r2?.chunks_stored, chunksTotal: r2?.chunks_total }, 'Fundamental spec stored');

  log.info('Seeding NVDA reference chart analysis');
  const r3 = await ingestDocument({
    text: NVDA_WAVE_ANALYSIS,
    sourceName: 'NVDA Weekly Chart — Perfect Elliott Wave Reference',
    sourceType: 'TLI_METHODOLOGY',
    sourceDate: '2026-04-04',
  });
  log.info({ chunksStored: r3?.chunks_stored, chunksTotal: r3?.chunks_total }, 'NVDA reference stored');

  log.info('Spec documents seeded');
}

if (require.main === module) {
  seedSpecs()
    .then(() => process.exit(0))
    .catch((err) => {
      log.error({ err }, 'Seed failed');
      process.exit(1);
    });
}

module.exports = { seedSpecs };
