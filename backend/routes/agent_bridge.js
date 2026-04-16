'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { freeformQuery } = require('../services/claude_interpreter');
const { logActivity } = require('../services/agent_logger');
const log = require('../services/logger').child({ module: 'agent_bridge' });

const VALID_MODES = new Set(['analysis', 'signal', 'risk', 'explain']);
const TIMEOUT_MS = 60_000;

// ── Auth middleware (mirrors adminAuth in server.js) ──────────────────────────
function agentAuth(req, res, next) {
  const ADMIN_KEY = process.env.ADMIN_API_KEY;
  if (!ADMIN_KEY) return next(); // open if no key configured
  const provided = req.headers['x-admin-key'] || req.query.admin_key;
  if (provided === ADMIN_KEY) return next();
  return res.status(403).json({ error: 'ADMIN_API_KEY required' });
}

// ── Helper: extract ticker symbol from text ───────────────────────────────────
function extractTicker(text) {
  if (!text) return null;
  const match = text.match(/\b([A-Z]{1,5})\b/);
  return match ? match[1] : null;
}

// ── Helper: race a promise against a timeout ──────────────────────────────────
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Agent query timed out after 60s')), ms)
    ),
  ]);
}

// ── POST /api/agent/query ─────────────────────────────────────────────────────
router.post('/api/agent/query', agentAuth, async (req, res) => {
  const started = Date.now();
  const { prompt, context, mode } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const resolvedMode = VALID_MODES.has(mode) ? mode : 'analysis';

  // Extract ticker: prefer context field, fall back to scanning the prompt
  const tickerFromContext = typeof context === 'object' ? context?.ticker : extractTicker(String(context || ''));
  const ticker = tickerFromContext || extractTicker(prompt.toUpperCase());

  // Fetch enriched Supabase data when a ticker is identified
  let enrichedData = {};
  if (ticker) {
    const [screenerRes, waveRes] = await Promise.all([
      supabase
        .from('screener_results')
        .select('ticker, company_name, current_price, tli_score, signal_tier, entry_price, fib_target, week_52_high, low_52w, pe_ratio, revenue_growth_pct, institutional_overlap')
        .eq('ticker', ticker)
        .limit(1),
      supabase
        .from('wave_counts')
        .select('ticker, current_wave, wave_position, wave_structure, confidence_score, confidence_label, tli_signal, entry_zone_low, entry_zone_high, stop_loss, target_1, reward_risk_ratio')
        .eq('ticker', ticker)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);
    enrichedData = {
      screener: screenerRes.data?.[0] || null,
      waveCount: waveRes.data?.[0] || null,
    };
  }

  const contextStr = typeof context === 'object' ? JSON.stringify(context) : (context || '');

  let aiResult;
  try {
    aiResult = await withTimeout(
      freeformQuery(prompt, contextStr, resolvedMode, enrichedData),
      TIMEOUT_MS
    );
  } catch (err) {
    log.error({ err, ticker, mode: resolvedMode }, 'Agent query failed');
    await logQuery({ prompt, ticker, mode: resolvedMode, error: err.message, durationMs: Date.now() - started });
    const status = err.message.includes('timed out') ? 504 : 500;
    return res.status(status).json({ error: err.message });
  }

  const response = {
    response:      aiResult.response      ?? null,
    ticker:        aiResult.ticker        ?? ticker ?? null,
    signal_tier:   aiResult.signal_tier   ?? enrichedData.screener?.signal_tier ?? null,
    entry_price:   aiResult.entry_price   ?? enrichedData.screener?.entry_price ?? null,
    fib_target:    aiResult.fib_target    ?? enrichedData.screener?.fib_target  ?? null,
    wave_position: aiResult.wave_position ?? enrichedData.waveCount?.current_wave ?? enrichedData.waveCount?.wave_position ?? null,
    confidence:    aiResult.confidence    ?? null,
    reasoning:     aiResult.reasoning     ?? null,
    timestamp:     new Date().toISOString(),
  };

  const durationMs = Date.now() - started;
  await logQuery({ prompt, ticker: response.ticker, mode: resolvedMode, response, durationMs });

  return res.json(response);
});

// ── Log query + response to agent_queries table ───────────────────────────────
async function logQuery({ prompt, ticker, mode, response, error, durationMs }) {
  try {
    await supabase.from('agent_queries').insert({
      prompt,
      ticker:        ticker ?? null,
      mode,
      response_json: response ?? null,
      error:         error ?? null,
      duration_ms:   durationMs,
    });
  } catch (err) {
    log.error({ err }, 'Failed to log agent query');
  }

  // Surface notable queries in the Agent Console
  if (!error) {
    logActivity({
      type: 'AGENT_QUERY',
      title: `Agent query: ${mode}${ticker ? ' · ' + ticker : ''}`,
      description: prompt.slice(0, 120),
      ticker: ticker ?? null,
      importance: 'INFO',
    }).catch(() => {});
  }
}

module.exports = router;
