#!/usr/bin/env node
'use strict';

/**
 * Weekly Report Generator
 *
 * Runs every Wednesday at 12:00 EST and Friday at 16:00 EST
 * Analyzes posts from that week, generates market report, sends to Telegram
 *
 * Cron schedule (in UTC):
 *   Wednesday 12:00 EST = 17:00 UTC → 0 17 * * 3
 *   Friday 16:00 EST = 21:00 UTC → 0 21 * * 5
 */

const https = require('https');
const log = require('../services/logger').child({ module: 'weekly_report_cron' });

const AIRTABLE_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = 'app57wLO5tYgpApjP';
const WEEKLY_REPORTS_TABLE = 'tblQLb83jXlM8a7Nf'; // Weekly Reports table
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8626469251'; // Andrew's Telegram ID

// Airtable API wrapper
function airtableFetch(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers = { 'Authorization': `Bearer ${AIRTABLE_KEY}` };
    if (body) headers['Content-Type'] = 'application/json';

    const reqOpts = {
      hostname: 'api.airtable.com',
      path,
      method,
      headers,
      timeout: 15000
    };
    if (body) reqOpts.headers['Content-Length'] = Buffer.byteLength(body);

    let data = '';
    const req = https.request(reqOpts, res => {
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch(e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.abort(); reject(new Error('Timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// Get posts from the past week
async function getWeekPosts() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAgoStr = weekAgo.toISOString().split('T')[0];

  const tables = ['TLI Posts', 'AI & Agent Intelligence', 'AutoPilot', 'Politician Trades', 'Trade Ideas', 'Macro & Markets'];
  const allPosts = [];

  for (const table of tables) {
    try {
      const formula = `IS_AFTER({Date Posted}, '${weekAgoStr}')`;
      const encoded = encodeURIComponent(table);
      const path = `/v0/${BASE_ID}/${encoded}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=500`;
      const result = await airtableFetch(path);

      if (result.records) {
        for (const rec of result.records) {
          allPosts.push({
            table,
            date: rec.fields['Date Posted'],
            content: rec.fields['Content']?.slice(0, 200) || '',
            author: rec.fields['Author'] || rec.fields['Source'] || 'Unknown',
            ticker: rec.fields['Ticker'] || '',
          });
        }
      }
    } catch(e) {
      log.warn({ table, err: e.message }, 'Failed to fetch table posts');
    }
  }

  return allPosts;
}

// Generate market summary from posts (manual analysis — no hallucination)
async function generateReport(posts) {
  const tliPosts = posts.filter(p => p.table === 'TLI Posts');
  const aiPosts = posts.filter(p => p.table === 'AI & Agent Intelligence');
  const tradePosts = posts.filter(p => ['Trade Ideas', 'AutoPilot', 'Politician Trades'].includes(p.table));
  const macroPosts = posts.filter(p => p.table === 'Macro & Markets');

  // Extract tickers mentioned
  const tickers = new Set();
  posts.forEach(p => {
    const matches = p.content.match(/\$[A-Z]{1,5}/g) || [];
    matches.forEach(m => tickers.add(m.slice(1)));
  });

  const report = {
    summary: `Analyzed ${posts.length} posts from this week across ${new Set(posts.map(p => p.table)).size} sources.`,
    tliInsights: tliPosts.length > 0 ? `${tliPosts.length} Elliott Wave analyses posted. Focus on wave positions and Fib targets.` : 'No TLI posts this week.',
    aiLearnings: aiPosts.length > 0 ? `${aiPosts.length} AI/agent posts. Track new methodologies and agent patterns.` : 'No AI learnings this week.',
    tradeActivity: tradePosts.length > 0 ? `${tradePosts.length} trade ideas/signals. Top tickers: ${Array.from(tickers).slice(0, 5).join(', ')}.` : 'No trade activity tracked.',
    macroContext: macroPosts.length > 0 ? `${macroPosts.length} macro updates. Watch VIX, breadth, and regime changes.` : 'No macro context this week.',
    tickersTracked: Array.from(tickers),
  };

  return report;
}

// Insert report into Airtable
async function insertReport(weekEnding, reportContent) {
  const fields = {
    'Week Ending': weekEnding,
    'Report Content': reportContent,
    'Posts Analyzed': posts?.length || 0,
    'Status': 'Published'
  };

  try {
    const result = await airtableFetch(
      `/v0/${BASE_ID}/${WEEKLY_REPORTS_TABLE}`,
      { method: 'POST', body: { fields } }
    );
    return result.id ? true : false;
  } catch(e) {
    log.error({ err: e.message }, 'Failed to insert report');
    return false;
  }
}

// Send report to Telegram
async function sendToTelegram(message) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    });

    const opts = {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };

    let data = '';
    https.request(opts, res => {
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.ok || false);
        } catch {
          resolve(false);
        }
      });
    }).on('error', () => resolve(false)).write(body);
  });
}

// Main report generation
async function runWeeklyReport() {
  log.info('Starting weekly report generation');

  try {
    const posts = await getWeekPosts();
    if (posts.length === 0) {
      log.info('No posts this week — skipping report');
      return;
    }

    const report = await generateReport(posts);
    const now = new Date();
    const weekEnding = new Date(now.getTime() - now.getDay() * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const reportText = `
**Weekly Market Report — Week of ${weekEnding}**

${report.summary}

**Elliott Wave & TLI:**
${report.tliInsights}

**AI & Agent Intelligence:**
${report.aiLearnings}

**Trade Activity:**
${report.tradeActivity}

**Macro Context:**
${report.macroContext}

**Tickers Tracked:**
${report.tickersTracked.slice(0, 10).join(', ')}

*(Full data in Airtable Weekly Reports table)*
    `.trim();

    // Insert into Airtable
    const inserted = await insertReport(weekEnding, reportText);
    log.info({ inserted, postsAnalyzed: posts.length }, 'Report generated');

    // Send to Telegram
    if (inserted) {
      const sent = await sendToTelegram(reportText);
      log.info({ sent }, 'Report sent to Telegram');
    }
  } catch(e) {
    log.error({ err: e.message }, 'Weekly report failed');
  }
}

// Export for cron or direct invocation
module.exports = { runWeeklyReport };

// If run directly: node weekly_report_cron.js
if (require.main === module) {
  runWeeklyReport().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
