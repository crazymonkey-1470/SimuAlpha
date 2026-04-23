#!/usr/bin/env node
'use strict';

/**
 * X (Twitter) Fetch — pulls latest posts from all tracked accounts into Airtable.
 * Every record gets a Source field so origin is always clear.
 *
 * Accounts & routing:
 *   3x/day (9am, 12pm, 8pm EST):
 *     @TheLongInvest  → TLI Posts
 *     @joinautopilot  → AutoPilot
 *     @QuiverQuant    → Politician Trades
 *     @Hedgeye        → Macro & Markets
 *     @Mr_Derivatives → Heinsenberg
 *     @pelositracker  → Politician Trades
 *
 *   1x/day (9am EST only):
 *     @AlexFinn        → AI & Agent Intelligence
 *     @milkroadAI      → AI & Agent Intelligence
 *     @alliekmiller    → AI & Agent Intelligence
 *     @PeterLBrandt    → TLI Posts
 *     @brewmarkets     → Macro & Markets
 *     @KobeissiLetter  → Macro & Markets
 */

const https = require('https');

const BEARER = process.env.X_BEARER_TOKEN;
const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = 'app57wLO5tYgpApjP';

const ALL_ACCOUNTS = [
  { handle: 'TheLongInvest',  id: '1378993399844442112', table: 'TLI Posts' },
  { handle: 'joinautopilot',  id: '1294318189388509184', table: 'AutoPilot' },
  { handle: 'QuiverQuant',    id: '1074457475485712384', table: 'Politician Trades' },
  { handle: 'Hedgeye',        id: '18719020',            table: 'Macro & Markets' },
  { handle: 'Mr_Derivatives', id: '958217615545049090',  table: 'Heinsenberg' },
  { handle: 'pelositracker',  id: '1540038673810350080', table: 'Politician Trades' },
  { handle: 'AlexFinn',       id: '1369348853414178822', table: 'AI & Agent Intelligence' },
  { handle: 'milkroadAI',     id: '1983916015877812224', table: 'AI & Agent Intelligence' },
  { handle: 'alliekmiller',   id: '39289455',            table: 'AI & Agent Intelligence' },
  { handle: 'PeterLBrandt',   id: '247857712',           table: 'TLI Posts' },
  { handle: 'brewmarkets',    id: '1782422848654446594', table: 'Macro & Markets' },
  { handle: 'KobeissiLetter', id: '3316376038',          table: 'Macro & Markets' },
];

const THREE_X_ONLY = ALL_ACCOUNTS.slice(0, 6);

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function xReq(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.x.com', path, method: 'GET',
      headers: { 'Authorization': `Bearer ${BEARER}` }, timeout: 10000
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('X API timeout')); });
    req.end();
  });
}

function atGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.airtable.com', path, method: 'GET',
      headers: { 'Authorization': `Bearer ${AIRTABLE_KEY}` }, timeout: 10000
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Airtable timeout')); });
    req.end();
  });
}

function atPost(table, fields) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ fields });
    const opts = {
      hostname: 'api.airtable.com',
      path: `/v0/${BASE_ID}/${encodeURIComponent(table)}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 10000
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Airtable timeout')); });
    req.write(body);
    req.end();
  });
}

async function getExistingIds(table) {
  const r = await atGet(`/v0/${BASE_ID}/${encodeURIComponent(table)}?fields%5B%5D=Post%20ID&maxRecords=300`);
  return new Set(r.records?.map(rec => rec.fields['Post ID']).filter(Boolean) || []);
}

// ── Build fields per table ────────────────────────────────────────────────────
function buildFields(acc, tweet) {
  const tickers = (tweet.text.match(/\$[A-Z]{1,5}/g) || []).map(m => m.slice(1)).join(', ');
  const source = `@${acc.handle}`;
  const base = {
    'Date Posted': tweet.created_at.split('T')[0],
    'Content': tweet.text,
    'Key Insight': tweet.text.split('\n')[0].slice(0, 200),
    'Post ID': tweet.id,
    // Note: Source field handling is per-table below (singleSelect vs prefix)
  };

  switch (acc.table) {
    case 'TLI Posts':
      return { ...base, 'Learned': false, ...(tickers ? { 'Ticker': tickers } : {}) };

    case 'AI & Agent Intelligence':
      return { ...base, 'Author': 'Other', 'Actionable': false, 'Applied': false };

    case 'AutoPilot':
      return { ...base, 'Actionable': false, ...(tickers ? { 'Ticker': tickers } : {}) };

    case 'Politician Trades':
      // Source is a restricted singleSelect (API can't add new options).
      // Prefix Content with source to maintain traceability.
      const ptContent = `[@${acc.handle}] ${tweet.text}`;
      return { 
        'Date Posted': base['Date Posted'],
        'Content': ptContent,
        'Key Insight': base['Key Insight'],
        'Post ID': base['Post ID'],
        'Actionable': false,
        ...(tickers ? { 'Ticker': tickers } : {})
      };

    case 'Heinsenberg':
      return { ...base, 'Actionable': false, ...(tickers ? { 'Ticker': tickers } : {}) };

    case 'Macro & Markets':
      // Source is a restricted singleSelect (API can't add new options).
      // Prefix Content with source to maintain traceability.
      const mmContent = `[@${acc.handle}] ${tweet.text}`;
      return {
        'Date Posted': base['Date Posted'],
        'Content': mmContent,
        'Key Insight': base['Key Insight'],
        'Post ID': base['Post ID'],
        'Actionable': false,
      };

    default:
      return base;
  }
}

// ── Fetch one account ─────────────────────────────────────────────────────────
async function fetchAccount(acc, existingIds) {
  try {
    const r = await xReq(`/2/users/${acc.id}/tweets?max_results=10&tweet.fields=created_at,text`);
    if (!r.data?.length) { process.stdout.write(`⊘ @${acc.handle}: no posts\n`); return 0; }

    let added = 0;
    for (const tweet of r.data) {
      if (existingIds.has(tweet.id)) continue;
      if (tweet.text.startsWith('RT @') || tweet.text.length < 60) continue;

      const fields = buildFields(acc, tweet);
      const res = await atPost(acc.table, fields);
      if (res.id) { added++; existingIds.add(tweet.id); }
      else process.stderr.write(`  ⚠️ insert failed: ${JSON.stringify(res.error)}\n`);
    }

    process.stdout.write(`✅ @${acc.handle}: +${added} → ${acc.table}\n`);
    return added;
  } catch(e) {
    process.stderr.write(`❌ @${acc.handle}: ${e.message}\n`);
    return 0;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function runFetch(accounts) {
  const allTables = [...new Set(accounts.map(a => a.table))];
  const tableIds = {};
  for (const t of allTables) tableIds[t] = await getExistingIds(t);

  let total = 0;
  for (const acc of accounts) {
    total += await fetchAccount(acc, tableIds[acc.table]);
  }
  return total;
}

module.exports = { runFetch, ALL_ACCOUNTS, THREE_X_ONLY };

// Run directly: node x_fetch.js [--3x-only]
if (require.main === module) {
  const threeXOnly = process.argv.includes('--3x-only');
  const accounts = threeXOnly ? THREE_X_ONLY : ALL_ACCOUNTS;
  process.stdout.write(`Running ${threeXOnly ? '3x-only' : 'full'} fetch — ${accounts.length} accounts\n`);
  runFetch(accounts)
    .then(total => { process.stdout.write(`\n✅ Done — ${total} new posts\n`); process.exit(0); })
    .catch(e => { process.stderr.write(`Fatal: ${e.message}\n`); process.exit(1); });
}
