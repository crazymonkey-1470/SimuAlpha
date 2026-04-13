/**
 * seed_doc_2_fundamental.js — Fundamental Analysis Engine Specification
 *
 * Ingests the complete fundamental analysis methodology into the knowledge base.
 * Covers Lynch/Buffett screens, health checks, valuation, classification,
 * position sizing, and risk filters.
 *
 * Run: node backend/scripts/seed_doc_2_fundamental.js
 */
require('dotenv').config();
const log = require('../services/logger').child({ module: 'seed_doc_2_fundamental' });
const supabase = require('../services/supabase');
const { ingestDocument } = require('../services/ingest');

const SOURCE_NAME = 'SimuAlpha Fundamental Analysis Engine — Complete';
const SOURCE_TYPE = 'TLI_METHODOLOGY';
const SOURCE_DATE = '2026-04-13';

const FUNDAMENTAL_DOC = `
SimuAlpha Fundamental Analysis Engine — Complete Specification

LYNCH SCREEN (7 CRITERIA)
Evaluates Peter Lynch-style quality. Pass threshold: 5 of 7.
1. Revenue growing YoY (revenueGrowthYoY > 0)
2. Revenue growth accelerating OR 3yr avg > 0
3. Gross margin above sector median OR > 30%
4. Positive free cash flow (freeCashFlow > 0)
5. Debt-to-equity below 1.0 OR cash exceeds total debt
6. EPS growing YoY (epsGrowthYoY > 0)
7. Insider net buying OR shares outstanding not diluting
A perfect 7/7 earns the LYNCH_PERFECT_SCORE badge.

BUFFETT SCREEN (9 CRITERIA)
Evaluates Warren Buffett-style quality. Pass threshold: 6 of 9.
1. Gross margin > 40% (durable competitive advantage)
2. Operating margin > 15%
3. ROE proxy: net income / market cap > 5%
4. Debt-to-equity < 0.5
5. Free cash flow positive and growing (FCF growth YoY > 0)
6. Revenue growth consistent (3yr avg > 5%)
7. Share count stable or declining (sharesOutstandingChange <= 0)
8. P/E ratio < 25 OR forward P/E < 20
9. Cash-to-debt ratio > 0.5

FINANCIAL HEALTH CHECK (12 METRICS)
Red flags indicate structural weakness. 3+ red flags = HEALTH_FAIL.
1. Revenue declining 2+ consecutive periods
2. Gross margin contracting > 5% YoY
3. Operating margin negative
4. Free cash flow negative 2+ periods
5. Debt-to-equity > 2.0
6. Current ratio < 1.0
7. Interest coverage < 2x (EBITDA / annual debt service)
8. Share dilution > 3% YoY
9. Insider selling while shares diluting
10. Guidance lowered (EPS declining 2+ consecutive quarters > 10% each)
11. Dividend cut (yield decline > 20%)
12. Cash burn rate unsustainable (cash / quarterly burn < 4 quarters)

THREE-METHOD VALUATION
Three independent price targets averaged for composite:
1. DCF (Discounted Cash Flow): 5-year FCF projection + terminal value.
   Formula: Sum PV of projected FCF + PV of terminal value.
   Terminal = (Year5 FCF * (1 + terminal%)) / (WACC - terminal%).
   Exclusion rule: DCF excluded if it diverges > 20% from the multiples average.
2. EV/Sales: Enterprise Value = TTM Revenue * sector multiple. Subtract net debt.
3. EV/EBITDA: Enterprise Value = TTM EBITDA * sector multiple. Subtract net debt.
Method agreement: HIGH (stdev < 5%), MEDIUM (< 15%), LOW (>= 15%).

MATURITY CLASSIFIER (5 PROFILES)
Determines WACC, terminal growth rate, and FCF growth assumptions.
1. DEFENSIVE_LOW_RISK: WACC 5-6%, Terminal 1.5-2.0%, FCF Growth 2-5%.
   Trigger: dividend yield > 2% AND FCF margin > 15% AND beta < 0.8.
2. MATURE_STABLE: WACC 6-7%, Terminal 2.0-2.5%, FCF Growth 4-10%.
   Trigger: revenue growth < 10% AND FCF margin > 10% AND dividend yield > 1%.
3. LARGE_CAP_WITH_RISK: WACC 8-9%, Terminal 2.5%, FCF Growth 5-15%.
   Default bucket if no other matches.
4. HIGH_GROWTH_MONOPOLY: WACC 8-9%, Terminal 2.5-3.0%, FCF Growth 15-28%.
   Trigger: revenue growth > 20% AND FCF margin > 15%.
5. CYCLICAL_FX_EXPOSED: WACC 9-10%, Terminal 1.5-2.5%, FCF Growth variable.
   Trigger: beta > 1.3 OR cyclical sector OR FX exposure.

VALIDATED PARAMETERS (Ticker: WACC/Terminal/Upside):
UNH 8%/2.5%/+36.2%, ZETA 9%/3.0%/+32%, NVDA 8%/3.0%/+22%,
PFE 6%/2.0%/+14.3%, LULU 9%/2.5%/+13.5%, ABNB 9%/2.5%/+12.8%,
OXY 9%/1.5%/+9.4%, KO 6.5%/2.5%/+5.6%, V 6%/2.5%/+3.9%,
AAPL 9%/2.5%/+3.6% excluded, NESN 5%/1.5%/+1.5%,
LVMH 10%/2.5%/-5%, HOOD 8%/2.0%/-19.4%.

LYNCH 6-CATEGORY CLASSIFICATION
1. FAST_GROWER: EPS growth >= 20%. Hold 5-10yr. 10-bagger potential. Sell when growth slows 2+ quarters. Allocate 30-40%.
2. STALWART: EPS growth >= 10%. Hold 1-3yr. 30-50% gain target. Sell at 30-50% gain. Allocate 20-30%.
3. SLOW_GROWER: EPS growth >= 2%. Dividend only. Lynch says avoid. Allocate 0%.
4. TURNAROUND: Was losing money, now profitable. Hold until recovery completes. 5-15x potential. Allocate 5-10%.
5. CYCLICAL: Variable growth, cyclical sectors (Energy, Materials, Industrials, Real Estate). Timing-dependent. Allocate 10-20%.
6. UNCLASSIFIED: No clear pattern. Review needed.
Migration detection: Fast Grower to Stalwart if EPS growth < 15% for 2+ quarters.
Stalwart rotation signal when gain from entry >= 30%.

PEG RATIO THRESHOLDS
PEG = P/E Ratio / EPS Growth Rate.
< 1.0: ATTRACTIVE, 1.0-1.5: FAIR, 1.5-2.0: ELEVATED, > 2.0: EXPENSIVE.

MARGIN OF SAFETY
MoS = ((Intrinsic Value - Current Price) / Intrinsic Value) * 100.
> 15%: STRONG_MOS. > 10%: ADEQUATE_MOS. <= 10%: INSUFFICIENT_MOS.
Required for BUY recommendation: >= 10%.

MOAT SCORE (0-5)
Assessed by AI classify_moat skill. Tiers: MONOPOLY (5), STRONG_PLATFORM (4), MODERATE (2-3), NONE (0-1).
Scoring impact: MONOPOLY = full 5pts, STRONG_PLATFORM = 80% (4pts), MODERATE = 40% (2pts), NONE = 0.
Quality floor: moatScore >= 4 AND upside > -10% prevents SELL rating.

KILL THESIS FLAGS (Munger Inversion)
8 structural risk flags. 3+ flags forces rating downgrade to NEUTRAL.
1. PATENT_CLIFF: Patent expiration within 3 years
2. REGULATORY_ACTION: Pending regulatory enforcement
3. TARIFF_EXPOSURE: > 30% revenue exposed
4. EXCESSIVE_DEBT: D/E > 2.0 AND FCF margin < 5%
5. DATA_BREACH: Recent security breach
6. KEY_PERSON_RISK: Single person dependency
7. ACCOUNTING_ALLEGATIONS: Active allegations
8. EARNINGS_MANIPULATION: GAAP vs non-GAAP divergence > 30%

RATING ASSIGNMENT
Base rating from composite upside: > 30% STRONG_BUY, > 10% BUY, > -5% NEUTRAL, > -20% REDUCE, <= -20% SELL.
Overrides: Declining fundamentals caps at NEUTRAL. Leverage penalty (D/E > 4 non-Financial) downgrades one level. Opportunity cost: upside < 8% (S&P expected) downgrades BUY to NEUTRAL.

5-TRANCHE DCA POSITION SIZING
Tranches: 10% / 15% / 20% / 25% / 30% (cumulative: 10/25/45/70/100%).
Tranche 1: Wave C approaching support. Tranche 2: Support confirmed (higher low).
Tranche 3: Signs of reversal (higher high). Tranche 4: Trend confirmed (HH+HL series).
Tranche 5: Wave 2 completion (0.50-0.618 Fib holds).
Wave-based trim: Wave 3 top sell 20%. Wave 4 add back to full. Wave 5 top sell 50%.
Wave C complete: full cycle restart with fresh 5-tranche DCA.

5 HARD RISK FILTER RULES
1. Support must confirm before entry (price near 200WMA).
2. No chasing moves > 20% above support.
3. Weekly/monthly timeframes only for signals.
4. Earnings blackout 14 days before/after report.
5. Contrarian sentiment boost (extreme fear = higher conviction).
If risk filters fail on LOAD_THE_BOAT/ACCUMULATE/WATCHLIST: signal becomes SIGNAL_FILTERED.

MULTIPLE COMPRESSION DETECTION
DEEP_VALUE: Current EV/Sales > 30% below 5yr average AND revenue growing. Strong buy candidate.
OVERVALUED: Current EV/Sales > 30% above 5yr average. Reduce candidate.
NORMAL: Within +/- 30% of historical average.
`;

async function main() {
  log.info('Seed start — Fundamental Analysis Engine');

  // Step 1: Clear existing chunks for this source name
  log.info({ sourceName: SOURCE_NAME }, 'Deleting existing chunks');
  const { error: delError, count } = await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('source_name', SOURCE_NAME);

  if (delError) {
    log.error({ err: delError }, 'Delete error');
  } else {
    log.info({ count: count ?? 'unknown' }, 'Cleared existing chunks');
  }

  // Step 2: Ingest the document
  log.info({ sourceName: SOURCE_NAME }, 'Calling ingestDocument');
  const result = await ingestDocument({
    text: FUNDAMENTAL_DOC,
    sourceName: SOURCE_NAME,
    sourceType: SOURCE_TYPE,
    sourceDate: SOURCE_DATE,
  });

  log.info({ result }, 'Ingest result');
  log.info({ chunksStored: result.chunks_stored, chunksTotal: result.chunks_total }, 'Seed done');
  return { chunks_stored: result.chunks_stored, chunks_total: result.chunks_total };
}

module.exports = main;

if (require.main === module) {
  main().catch(err => {
    log.error({ err }, 'Seed failed');
    process.exit(1);
  });
}
