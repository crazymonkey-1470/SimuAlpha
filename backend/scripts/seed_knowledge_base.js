/**
const log = require('../services/logger').child({ module: 'seed_knowledge_base' });
 * Seed Knowledge Base — Sprint 8
 *
 * Ingests all existing documents into the knowledge_chunks table.
 * Run: node scripts/seed_knowledge_base.js
 *
 * For PDF files: place them in backend/data/ and this script will
 * attempt to extract text using pdf-parse. For plain text documents,
 * provide the text directly in the documents array.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ingestDocument } = require('../services/ingest');

// Attempt to load pdf-parse (optional dependency)
let pdfParse = null;
try {
  pdfParse = require('pdf-parse');
} catch (_) {
  log.info('[Seed] pdf-parse not installed. PDF files will be skipped.');
  log.info('[Seed] Install with: npm install pdf-parse');
}

const DATA_DIR = path.join(__dirname, '..', 'data');

// ═══════════════════════════════════════════
// DOCUMENT REGISTRY
// ═══════════════════════════════════════════

const documents = [
  // === SUPER INVESTOR REPORTS ===
  {
    source_name: 'Berkshire Hathaway Q4 2025 - Greg Abel',
    source_type: 'SUPER_INVESTOR_REPORT',
    source_date: '2025-12-31',
    file: 'The_Money_Flow_Research_-_Berkshire_Hathaway_-_Greg_Abel.pdf',
  },
  {
    source_name: 'Appaloosa Management Q4 2025 - David Tepper',
    source_type: 'SUPER_INVESTOR_REPORT',
    source_date: '2025-12-31',
    file: 'The_Money_Flow_Research_-_Tepper___Appaloosa_Management.pdf',
  },
  {
    source_name: 'Duquesne Family Office Q4 2025 - Druckenmiller',
    source_type: 'SUPER_INVESTOR_REPORT',
    source_date: '2025-12-31',
    file: 'The_Money_Flow_Research_-_Stanley_Druckenmiller__Duquesne_Family_Office.pdf',
  },
  {
    source_name: 'Tiger Global Q3 2025 - Chase Coleman',
    source_type: 'SUPER_INVESTOR_REPORT',
    source_date: '2025-09-30',
    file: 'The_Money_Flow_Research_-_Chase_Coleman.pdf',
  },

  // === VALUATION PAPERS ===
  {
    source_name: 'TLI Deep Dive - Microsoft MSFT',
    source_type: 'VALUATION_PAPER',
    source_date: '2026-04-03',
    file: 'DD_-_MSFT.pdf',
  },

  // === GRAHAM CHAPTERS ===
  {
    source_name: 'The Intelligent Investor - Chapter 8: Market Fluctuations',
    source_type: 'GRAHAM_CHAPTER',
    source_date: '1973-01-01',
    file: 'The_Intelligent_Investor__-_Chapter_8.pdf',
  },
  {
    source_name: 'The Intelligent Investor - Chapter 12: Per Share Earnings',
    source_type: 'GRAHAM_CHAPTER',
    source_date: '1973-01-01',
    file: 'The_Intelligent_Investor__-_Chapter_12.pdf',
  },

  // === MACRO ANALYSIS ===
  {
    source_name: 'Japanese Carry Trade Analysis',
    source_type: 'MACRO_ANALYSIS',
    source_date: '2025-12-01',
    file: 'The_Japanese_Carry_Trade.pdf',
  },
  {
    source_name: 'USD-GBP Exchange Rate Analysis',
    source_type: 'MACRO_ANALYSIS',
    source_date: '2026-03-17',
    file: 'THE_USD-GBP_EXCHANGE_RATE.pdf',
  },
  {
    source_name: 'CNY-USD Exchange Rate Analysis',
    source_type: 'MACRO_ANALYSIS',
    source_date: '2026-03-17',
    file: 'THE_CNY-USD_EXCHANGE_RATE.pdf',
  },
  {
    source_name: 'JPY-USD Exchange Rate Analysis',
    source_type: 'MACRO_ANALYSIS',
    source_date: '2026-03-17',
    file: 'THE_JPY-USD_EXCHANGE_RATE.pdf',
  },
  {
    source_name: 'US Dollar Exchange Rate in Charts - DXY Overview',
    source_type: 'MACRO_ANALYSIS',
    source_date: '2026-03-17',
    file: 'US_DOLLAR_EXCHANGE_RATE_IN_CHARTS.pdf',
  },

  // === TLI METHODOLOGY (plain text) ===
  {
    source_name: 'TLI Complete Technical Methodology',
    source_type: 'TLI_METHODOLOGY',
    source_date: '2026-04-01',
    text: `The Long Investor (TLI) methodology combines fundamental analysis, technical analysis via Elliott Wave Theory, and institutional tracking to identify high-conviction long-term investment opportunities.

SCORING SYSTEM (0-100):
Fundamental Score (0-50): Revenue growth, FCF margin, balance sheet strength, earnings quality, moat assessment, institutional ownership.
Technical Score (0-50): Price relative to 200WMA/200MMA, Elliott Wave position, confluence zones, golden/death cross, volume trends.

SIGNAL LEVELS:
LOAD THE BOAT (80+): Highest conviction. All signals aligned.
ACCUMULATE (65-79): Strong buy with minor concerns.
WATCH (50-64): Interesting but not actionable yet.
PASS (<50): Does not meet TLI criteria.

ELLIOTT WAVE RULES:
- Wave 2 NEVER retraces below Wave 1 start
- Wave 3 is NEVER the shortest of waves 1, 3, 5
- Wave 4 CANNOT enter Wave 2 territory
- Wave 2 entry at 0.500-0.618 Fibonacci retracement is the PRIMARY TLI entry point
- Wave 3 target: 1.618 extension
- Confluence zone: price near both 200WMA and 0.618 Fib = highest conviction

POSITION SIZING (5-part system):
Buy 1/5: Wave 1 breakout confirmed
Buy 2/5: Wave 2 at 0.618 Fib (PRIMARY ENTRY)
Buy 3/5: Subwave 2 within Wave 3
Buy 4/5: Second pullback within Wave 3
Buy 5/5: Reserve for unexpected pullbacks

EXIT RULES:
Trim 50% at Wave 3 target (1.618 extension)
Add at Wave 4 (0.382 retracement)
Exit full at Wave 5 target
Re-enter after Wave C completes

VALUATION: Three-Pillar approach using DCF, EV/Sales, and EV/EBITDA.
FCF is the truth metric — FCF positive is non-negotiable for buy signals.
Graham Chapter 12: Never trust single-year earnings. Use 2-3 year averages.`,
  },
];

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  log.info('═══════════════════════════════════════════');
  log.info('Seeding SimuAlpha Knowledge Base');
  log.info('═══════════════════════════════════════════\n');

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    log.info(`[Seed] Created ${DATA_DIR} — place PDF files here.\n`);
  }

  let ingested = 0;
  let skipped = 0;

  for (const doc of documents) {
    let text = doc.text || null;

    // If file-based, try to extract text
    if (!text && doc.file) {
      const filePath = path.join(DATA_DIR, doc.file);
      if (!fs.existsSync(filePath)) {
        log.info(`[Seed] SKIP: ${doc.file} not found in ${DATA_DIR}`);
        skipped++;
        continue;
      }

      if (doc.file.endsWith('.pdf') && pdfParse) {
        try {
          const buffer = fs.readFileSync(filePath);
          const parsed = await pdfParse(buffer);
          text = parsed.text;
        } catch (err) {
          log.error(`[Seed] PDF parse error for ${doc.file}:`, err.message);
          skipped++;
          continue;
        }
      } else if (doc.file.endsWith('.txt') || doc.file.endsWith('.md')) {
        text = fs.readFileSync(filePath, 'utf-8');
      } else if (!pdfParse && doc.file.endsWith('.pdf')) {
        log.info(`[Seed] SKIP: ${doc.file} (pdf-parse not installed)`);
        skipped++;
        continue;
      }
    }

    if (!text || text.trim().length < 50) {
      log.info(`[Seed] SKIP: ${doc.source_name} — insufficient text`);
      skipped++;
      continue;
    }

    try {
      const result = await ingestDocument({
        text,
        sourceName: doc.source_name,
        sourceType: doc.source_type,
        sourceDate: doc.source_date,
      });
      ingested++;
      log.info(`  ${doc.source_name}: ${result.chunks_stored} chunks\n`);
    } catch (err) {
      log.error(`[Seed] Failed: ${doc.source_name} —`, err.message);
      skipped++;
    }
  }

  log.info('\n═══════════════════════════════════════════');
  log.info(`Knowledge base seed complete: ${ingested} ingested, ${skipped} skipped`);
  log.info('═══════════════════════════════════════════');
}

if (require.main === module) {
  main().catch(err => {
    log.error('Seed failed:', err);
    process.exit(1);
  });
}

module.exports = main;
