/**
 * seed_doc_1_scoring.js — TLI Scoring Methodology
 *
 * Ingests the complete TLI scoring algorithm reference into the knowledge base.
 * This is the definitive specification for how SimuAlpha scores stocks.
 *
 * Run: node backend/scripts/seed_doc_1_scoring.js
 */
require('dotenv').config();
const log = require('../services/logger').child({ module: 'seed_doc_1_scoring' });
const supabase = require('../services/supabase');
const { ingestDocument } = require('../services/ingest');

const SOURCE_NAME = 'TLI Scoring Algorithm v1.0';
const SOURCE_TYPE = 'TLI_METHODOLOGY';
const SOURCE_DATE = '2026-04-12';

const TLI_SCORING_DOC = `
TLI Scoring Algorithm v1.0

Total Score = Fundamental (0-30) + Wave Position (-15 to +30) + Confluence (0-40) = 100pts

FUNDAMENTAL (0-30): 5 pass/fail gates first (revenue growing, margins not contracting, debt serviceable, guidance not lowered, no heavy insider selling). Then 6 criteria at 5pts each: revenue accelerating, margins expanding, positive FCF, strong balance sheet, large TAM, competitive moat.

WAVE POSITION (-15 to +30): Wave C bottom +30, Wave 2 bottom +25, Wave 4 support +20, Wave A bottom +15, Wave 1 forming +10, Wave 3 in progress +5, Wave 5 +0, Wave B bounce -10, Ending diagonal -15.

CONFLUENCE (0-40): Previous low +3, round number +2, 50MA +3, 200MA +4, 200WMA +5, Fib 0.382 +3, Fib 0.5 +4, Fib 0.618 +5, Fib 0.786 +4, Wave 1 origin +5. CONFLUENCE ZONE (200WMA + 0.618 Fib within 3%) +15. GENERATIONAL BUY (0.786 + W1 origin + 200MMA within 15%) +20.

LABELS: 85-100 LOAD THE BOAT, 70-84 ACCUMULATE, 55-69 WATCHLIST, 40-54 HOLD, 25-39 CAUTION, 10-24 TRIM, 0-9 AVOID.

ELLIOTT WAVE HARD RULES: Wave 2 never below Wave 1 start. Wave 3 never shortest. Wave 4 not in Wave 2 territory. Four patterns: Normal, Extended, Leading Diagonal, Ending Diagonal.

FIBONACCI: Wave 2 entry 0.5-0.618. Wave 3 target 1.618x. Wave 4 pullback 0.382. Wave 5 target 1.0-2.618. Wave C target 0.618. 50-day MA confirms Wave 2.

POSITION SIZING: 5 tranches increasing 10/15/20/25/30%. Trim 20% at Wave 3 top. Add back at Wave 4. Sell 50% at Wave 5. Full restart at Wave C.

RISK FILTERS: Support must confirm. No chasing >20%. Weekly/monthly only. Earnings blackout 14 days. Contrarian sentiment boost.

DOWNTREND FILTER: 8 signals scored. Score >=4 suppresses all buys except GENERATIONAL.
`;

async function main() {
  log.info('Seed start — TLI Scoring Algorithm Reference');

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
    text: TLI_SCORING_DOC,
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
