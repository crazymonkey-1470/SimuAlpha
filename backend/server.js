require('dotenv').config();
const express = require('express');
const log = require('./services/logger').child({ module: 'server' });
const { runFullPipeline, startCron } = require('./cron');
const supabase = require('./services/supabase');
const { getInvestors, refreshAllInvestors } = require('./services/institutional');
const { getLatestMacroContext, getMacroContextHistory, upsertMacroContext } = require('./services/macro');
const { getValuation, computeAndSaveValuation, batchComputeValuations } = require('./services/valuation');
const { getSignalHistory, getAccuracyStats } = require('./services/signalTracker');
const { applyWeightAdjustment, getAllConfig } = require('./services/scoring_config');

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════
const { envelope } = require('./middleware/envelope');
app.use(envelope);

// ═══════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════
const ALLOWED_ORIGINS = [
  'https://simualpha.com',
  'https://www.simualpha.com',
  process.env.FRONTEND_URL,
  process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : null,
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAllowed = !origin || ALLOWED_ORIGINS.includes(origin) || /\.simualpha\.pages\.dev$/.test(origin) || /\.pages\.dev$/.test(origin);
  if (isAllowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-admin-key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ═══════════════════════════════════════════
// V1 API ROUTES (authenticated)
// ═══════════════════════════════════════════
const v1StocksRouter = require('./routes/v1/stocks');
app.use('/api/v1/stocks', v1StocksRouter);

// ═══════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════
const rateLimits = new Map();

function rateLimit(maxRequests = 60, windowMs = 60000) {
  return (req, res, next) => {
    const key = (req.ip || 'unknown') + ':' + req.baseUrl;
    const now = Date.now();
    if (!rateLimits.has(key)) {
      rateLimits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    const limit = rateLimits.get(key);
    if (now > limit.resetAt) { limit.count = 1; limit.resetAt = now + windowMs; return next(); }
    limit.count++;
    if (limit.count > maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    next();
  };
}

app.use('/api/', rateLimit(120, 60000));
app.use('/api/analyze', rateLimit(10, 60000));
app.use('/api/chat', rateLimit(30, 60000));
app.use('/api/admin', rateLimit(20, 60000));

// ═══════════════════════════════════════════
// ADMIN AUTH
// ═══════════════════════════════════════════
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.admin_key;
  const ADMIN_KEY = process.env.ADMIN_API_KEY;
  if (!ADMIN_KEY) return next();
  if (key === ADMIN_KEY) return next();
  res.status(403).json({ error: 'Admin access required' });
}

app.use('/api/admin', adminAuth);

// ═══════════════════════════════════════════
// INSTITUTIONAL API ENDPOINTS
// ═══════════════════════════════════════════

// List all 8 tracked super investors
app.get('/api/investors', async (_req, res) => {
  try {
    const investors = await getInvestors();
    res.json({ investors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Latest holdings for a specific investor
app.get('/api/investors/:id/holdings', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('investor_holdings')
      .select('*')
      .eq('investor_id', req.params.id)
      .order('portfolio_rank', { ascending: true })
      .limit(100);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ holdings: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Quarterly signals for a specific investor
app.get('/api/investors/:id/signals', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('investor_signals')
      .select('*')
      .eq('investor_id', req.params.id)
      .order('quarter', { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ signals: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cross-investor consensus for a specific ticker
app.get('/api/consensus/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const { data, error } = await supabase
      .from('consensus_signals')
      .select('*')
      .eq('ticker', ticker)
      .order('quarter', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ticker, consensus: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sector-level consensus
app.get('/api/consensus/sectors', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('consensus_signals')
      .select('*')
      .order('consensus_score', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    // Group by sector using screener_results
    const { data: sectorData } = await supabase
      .from('screener_results')
      .select('ticker, sector')
      .not('sector', 'is', null);
    const sectorMap = {};
    for (const s of (sectorData || [])) {
      sectorMap[s.ticker] = s.sector;
    }

    const sectors = {};
    for (const c of (data || [])) {
      const sector = sectorMap[c.ticker] || 'Unknown';
      if (!sectors[sector]) sectors[sector] = { sector, tickers: 0, avgScore: 0, totalScore: 0 };
      sectors[sector].tickers++;
      sectors[sector].totalScore += c.consensus_score || 0;
    }
    for (const s of Object.values(sectors)) {
      s.avgScore = s.tickers > 0 ? Math.round(s.totalScore / s.tickers * 10) / 10 : 0;
      delete s.totalScore;
    }

    res.json({ sectors: Object.values(sectors).sort((a, b) => b.avgScore - a.avgScore) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Top consensus picks
app.get('/api/consensus/top-picks', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('consensus_signals')
      .select('*')
      .order('consensus_score', { ascending: false })
      .limit(20);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ topPicks: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual holdings entry endpoint
app.post('/api/admin/investor-holdings', async (req, res) => {
  try {
    const { investor_id, quarter, holdings } = req.body;
    if (!investor_id || !quarter || !holdings?.length) {
      return res.status(400).json({ error: 'Missing investor_id, quarter, or holdings' });
    }

    const rows = holdings.map((h, idx) => ({
      investor_id,
      quarter,
      ticker: h.ticker?.toUpperCase() || 'UNKNOWN',
      cusip: h.cusip || null,
      company_name: h.company_name || null,
      shares: h.shares,
      market_value: h.market_value,
      pct_of_portfolio: h.pct_of_portfolio || null,
      portfolio_rank: idx + 1,
      has_call_options: h.has_call_options || false,
      has_put_options: h.has_put_options || false,
    }));

    const { error } = await supabase
      .from('investor_holdings')
      .upsert(rows, { onConflict: 'investor_id,quarter,ticker' });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, holdings_count: rows.length, quarter });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger institutional data refresh
app.post('/api/admin/refresh-institutional', async (_req, res) => {
  try {
    res.json({ status: 'started' });
    refreshAllInvestors().catch(err =>
      log.error({ err }, 'Institutional refresh error')
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run a seed script by name
app.post('/api/admin/seed/:script', async (req, res) => {
  const allowed = ['seed_13f', 'seed_sain_sources', 'seed_spec_documents', 'seed_doc_1_scoring', 'seed_doc_2_fundamental', 'seed_doc_3_nvda', 'seed_macro_context'];
  if (!allowed.includes(req.params.script)) return res.status(400).json({ error: 'Unknown script' });
  try {
    const fn = require('./scripts/' + req.params.script);
    const result = await fn();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check seed status across key tables
app.get('/api/admin/seed-status', async (_req, res) => {
  try {
    const counts = {};
    for (const table of ['knowledge_chunks', 'sain_sources', 'investor_holdings', 'scoring_config']) {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      counts[table] = count || 0;
    }
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Force re-score a single ticker through the full pipeline
app.get('/api/admin/rescore/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  try {
    const { deepScoreSingle } = require('./pipeline/stage3_deepscore');
    const result = await deepScoreSingle(ticker);
    res.json({ success: true, ticker, result });
  } catch (err) {
    res.json({ error: err.message, stack: err.stack?.split('\n').slice(0, 5) });
  }
});

// Debug endpoint: test direct inserts into sain_sources and knowledge_chunks
app.get('/api/admin/test-insert', async (req, res) => {
  try {
    // Try inserting one row directly
    const { data, error } = await supabase.from('sain_sources').insert({
      name: 'Test Source',
      platform: 'X',
      handle: '@test',
      source_type: 'AI_PORTFOLIO',
      category: 'AI_MODEL',
      scrape_method: 'X_API',
      priority: 'LOW',
      active: true,
      scrape_frequency_hours: 24
    }).select();

    // Also try knowledge_chunks
    const { data: data2, error: error2 } = await supabase.from('knowledge_chunks').insert({
      source_type: 'TEST',
      source_name: 'Test Doc',
      chunk_text: 'This is a test chunk',
      chunk_index: 0,
      tickers_mentioned: [],
      topics: []
    }).select();

    // Clean up test data
    if (data?.[0]) await supabase.from('sain_sources').delete().eq('name', 'Test Source');
    if (data2?.[0]) await supabase.from('knowledge_chunks').delete().eq('source_type', 'TEST');

    res.json({
      sain_sources: { success: !!data, error: error?.message, details: error },
      knowledge_chunks: { success: !!data2, error: error2?.message, details: error2 }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Seed all scripts in one call
app.get('/api/admin/seed-all', async (req, res) => {
  try {
  const results = {};
  const scripts = ['seed_sain_sources', 'seed_13f', 'seed_doc_1_scoring', 'seed_doc_2_fundamental', 'seed_doc_3_nvda', 'seed_macro_context'];
  results._version = 'v3-auto-migrate';

  // ── Auto-migrations: ensure tables exist before seeding ──
  const migrations = [];
  try {
    await supabase.rpc('exec_sql', { sql: `
      CREATE TABLE IF NOT EXISTS agent_activity (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        activity_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        details JSONB,
        ticker TEXT,
        importance TEXT DEFAULT 'INFO',
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `});
    migrations.push('agent_activity: OK');
  } catch (err) {
    migrations.push('agent_activity: ' + err.message);
  }

  try {
    await supabase.rpc('exec_sql', { sql: `
      CREATE TABLE IF NOT EXISTS agent_suggestions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        suggestion_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        evidence JSONB,
        priority TEXT DEFAULT 'MEDIUM',
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT now(),
        resolved_at TIMESTAMPTZ
      );
    `});
    migrations.push('agent_suggestions: OK');
  } catch (err) {
    migrations.push('agent_suggestions: ' + err.message);
  }

  try {
    await supabase.rpc('exec_sql', { sql: `
      DO $$ BEGIN
        ALTER TABLE exit_signals ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT false;
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `});
    migrations.push('exit_signals.acknowledged: OK');
  } catch (err) {
    migrations.push('exit_signals.acknowledged: ' + err.message);
  }
  results._migrations = migrations;

  for (const script of scripts) {
    try {
      // Clear require cache to force fresh execution
      const scriptPath = require.resolve('./scripts/' + script);
      delete require.cache[scriptPath];

      const fn = require('./scripts/' + script);
      if (typeof fn !== 'function') {
        results[script] = { error: 'Module does not export a function, got: ' + typeof fn };
        continue;
      }
      const fnResult = await fn();
      results[script] = fnResult || { success: true, note: 'completed but returned no data' };
    } catch (err) {
      results[script] = { error: err.message, stack: err.stack?.split('\n').slice(0, 3) };
    }
  }

  const counts = {};
  for (const table of ['knowledge_chunks', 'sain_sources', 'investor_holdings', 'scoring_config']) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    counts[table] = count || 0;
  }

  res.json({ results, counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// MACRO CONTEXT ENDPOINTS (Sprint 6B)
// ═══════════════════════════════════════════

// Latest macro context
app.get('/api/macro-context', async (_req, res) => {
  try {
    const ctx = await getLatestMacroContext();
    if (!ctx) return res.json({ context: null, message: 'No macro context data yet' });
    res.json({ context: ctx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Polymarket macro signals — real-time prediction market intelligence
app.get('/api/macro-context/polymarket', async (_req, res) => {
  try {
    const { getMacroSignals } = require('./services/polymarket');
    const signals = await getMacroSignals();
    res.json({ signals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Macro context history
app.get('/api/macro-context/history', async (req, res) => {
  const limit = parseInt(req.query.limit) || 30;
  try {
    const history = await getMacroContextHistory(limit);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update macro context
app.post('/api/admin/macro-context', async (req, res) => {
  try {
    const ctx = await upsertMacroContext(req.body);
    res.json({ success: true, context: ctx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard aggregates
app.get('/api/dashboard/market-risk', async (_req, res) => {
  try {
    const ctx = await getLatestMacroContext();
    if (!ctx) return res.json({ risk: null });
    res.json({
      risk: {
        level: ctx.market_risk_level,
        lateCycleScore: ctx.late_cycle_score,
        carryTradeRisk: ctx.carry_trade_risk,
        sp500PE: ctx.sp500_pe,
        vix: ctx.vix,
        dxy: ctx.dxy_index,
        jpyUsd: ctx.jpy_usd,
        jpyNearIntervention: ctx.jpy_near_intervention,
        investorsDefensive: ctx.investors_defensive_count,
        berkshireCashRatio: ctx.berkshire_cash_equity_ratio,
        fedRate: ctx.fed_rate,
        bojRate: ctx.boj_rate,
        carrySpread: ctx.carry_spread,
        iranWarActive: ctx.iran_war_active,
        date: ctx.date,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/consensus-summary', async (_req, res) => {
  try {
    const { data: topBuys } = await supabase
      .from('consensus_signals')
      .select('*')
      .gt('consensus_score', 0)
      .order('consensus_score', { ascending: false })
      .limit(10);

    const { data: topSells } = await supabase
      .from('consensus_signals')
      .select('*')
      .lt('consensus_score', 0)
      .order('consensus_score', { ascending: true })
      .limit(10);

    res.json({ topBuys: topBuys || [], topSells: topSells || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/top-signals', async (_req, res) => {
  try {
    const { data } = await supabase
      .from('screener_results')
      .select('ticker, company_name, total_score, signal, current_price, valuation_rating, avg_price_target, avg_upside_pct')
      .in('signal', ['LOAD THE BOAT', 'ACCUMULATE', 'GENERATIONAL_BUY'])
      .order('total_score', { ascending: false })
      .limit(20);
    res.json({ signals: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// VALUATION ENDPOINTS (Sprint 6B)
// ═══════════════════════════════════════════

app.get('/api/valuation/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  try {
    const valuation = await getValuation(ticker);
    if (!valuation) return res.json({ ticker, valuation: null, message: 'No valuation computed yet' });
    res.json({ ticker, valuation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/valuation/compute/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  try {
    const valuation = await computeAndSaveValuation(ticker);
    if (!valuation) return res.status(404).json({ error: 'Insufficient data for valuation' });
    res.json({ ticker, valuation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/valuation/batch', async (_req, res) => {
  try {
    res.json({ status: 'started' });
    batchComputeValuations().catch(err =>
      log.error({ err }, 'Batch valuation error')
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// SIGNAL TRACKING ENDPOINTS (Sprint 6B)
// ═══════════════════════════════════════════

app.get('/api/signals/history', async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  try {
    const history = await getSignalHistory(limit);
    res.json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/signals/accuracy', async (_req, res) => {
  try {
    const stats = await getAccuracyStats();
    res.json({ accuracy: stats || { message: 'No outcome data yet' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// EXIT SIGNAL ENDPOINTS (Sprint 7)
// ═══════════════════════════════════════════

// Active (unacknowledged) exit signals
app.get('/api/exit-signals', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  try {
    const { data, error } = await supabase
      .from('exit_signals')
      .select('*')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ signals: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exit signals for a specific ticker
app.get('/api/exit-signals/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  try {
    const { data, error } = await supabase
      .from('exit_signals')
      .select('*')
      .eq('ticker', ticker)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ticker, signals: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Acknowledge an exit signal
app.post('/api/exit-signals/:id/acknowledge', async (req, res) => {
  try {
    const { error } = await supabase
      .from('exit_signals')
      .update({ acknowledged: true })
      .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// AGENTIC INTELLIGENCE ENDPOINTS (Sprint 8)
// ═══════════════════════════════════════════

const { analyzeStock, runLearningCycle } = require('./services/orchestrator');
const { invoke: invokeSkill, listSkills } = require('./skills');
const { retrieve: knowledgeRetrieve, getStats: knowledgeStats } = require('./services/knowledge');
const { ingestDocument } = require('./services/ingest');
const { computeConsensus: computeSAINConsensus, computeAllConsensus } = require('./services/sain_consensus');
require('./cron/sain_cron');

// --- Analysis ---

// Run full agentic analysis for a ticker
app.post('/api/analyze/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  try {
    res.json({ status: 'started', ticker });
    // Run analysis in background (don't block response)
    analyzeStock(ticker).catch(err =>
      log.error({ err, ticker }, 'Analysis error')
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get stored analysis for a ticker
app.get('/api/analysis/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  try {
    const { data, error } = await supabase
      .from('stock_analysis')
      .select('*')
      .eq('ticker', ticker)
      .single();
    if (error) return res.json({ ticker, analysis: null });
    res.json({ ticker, analysis: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get thesis for a ticker
app.get('/api/analysis/:ticker/thesis', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  try {
    const { data, error } = await supabase
      .from('stock_analysis')
      .select('ticker, signal, composite_score, thesis_text, thesis_json, greats_comparison, analyzed_at')
      .eq('ticker', ticker)
      .single();
    if (error) return res.json({ ticker, thesis: null });
    res.json({ ticker, thesis: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Knowledge Base ---

// Ingest a document (plain text)
app.post('/api/knowledge/ingest', async (req, res) => {
  const { text, sourceName, sourceType, sourceDate } = req.body;
  if (!text || !sourceName || !sourceType) {
    return res.status(400).json({ error: 'Missing text, sourceName, or sourceType' });
  }
  try {
    const result = await ingestDocument({ text, sourceName, sourceType, sourceDate });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search knowledge base
app.post('/api/knowledge/search', async (req, res) => {
  const { query, ticker, topics, sourceTypes, limit } = req.body;
  if (!query) return res.status(400).json({ error: 'Missing query' });
  try {
    const results = await knowledgeRetrieve({
      query,
      ticker: ticker || null,
      topics: topics || null,
      sourceTypes: sourceTypes || null,
      limit: limit || 10,
    });
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Knowledge base stats
app.get('/api/knowledge/stats', async (_req, res) => {
  try {
    const stats = await knowledgeStats();
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List knowledge documents (grouped by source)
app.get('/api/knowledge/documents', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('knowledge_chunks')
      .select('id, source_name, source_type, source_date, created_at')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    // Group by source_name
    const groups = {};
    for (const chunk of (data || [])) {
      if (!groups[chunk.source_name]) {
        groups[chunk.source_name] = {
          source_name: chunk.source_name,
          source_type: chunk.source_type,
          source_date: chunk.source_date,
          created_at: chunk.created_at,
          chunk_count: 0,
          chunk_ids: [],
        };
      }
      groups[chunk.source_name].chunk_count++;
      groups[chunk.source_name].chunk_ids.push(chunk.id);
    }
    res.json({ documents: Object.values(groups) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a knowledge document (all chunks by source_name)
app.delete('/api/knowledge/document/:sourceName', async (req, res) => {
  try {
    const { error } = await supabase
      .from('knowledge_chunks')
      .delete()
      .eq('source_name', decodeURIComponent(req.params.sourceName));
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Skills ---

// List all available skills
app.get('/api/skills', (_req, res) => {
  res.json({ skills: listSkills() });
});

// Invoke a specific skill
app.post('/api/skills/:skillName', async (req, res) => {
  const { skillName } = req.params;
  try {
    const result = await invokeSkill(skillName, req.body);
    res.json({ skill: skillName, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Learning ---

// Run a learning cycle
app.post('/api/learning/cycle', async (_req, res) => {
  try {
    res.json({ status: 'started' });
    runLearningCycle().catch(err =>
      log.error({ err }, 'Learning cycle error')
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get pending weight adjustments
app.get('/api/learning/adjustments', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('weight_adjustments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ adjustments: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve or reject a weight adjustment
// Sprint 10C — on approval:
//   1. Write the new weight into scoring_config (hot-reloads v3 scorer)
//   2. Ingest an "approved memo" into the knowledge base so future
//      agentic runs see the adjustment as precedent.
app.put('/api/learning/adjustments/:id', async (req, res) => {
  const { status, review_notes, reviewer } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be "approved" or "rejected"' });
  }
  try {
    // Fetch the full adjustment row so we know what to apply
    const { data: adjustment, error: fetchErr } = await supabase
      .from('weight_adjustments')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (fetchErr || !adjustment) {
      return res.status(404).json({ error: 'Adjustment not found' });
    }

    const modifiedBy = reviewer || 'admin';
    const now = new Date().toISOString();

    // Mark the adjustment row first so we always have an audit trail,
    // even if downstream steps fail.
    const updateRow = {
      status,
      reviewed_at: now,
      review_notes: review_notes || null,
    };
    if (status === 'approved') updateRow.applied_at = now;

    const { error: updateErr } = await supabase
      .from('weight_adjustments')
      .update(updateRow)
      .eq('id', req.params.id);
    if (updateErr) return res.status(500).json({ error: updateErr.message });

    if (status === 'rejected') {
      return res.json({ success: true, status: 'rejected' });
    }

    // === APPROVED PATH ===
    // 1. Apply the new weight via scoring_config (hot-reloads CACHE).
    let applied = null;
    try {
      applied = await applyWeightAdjustment({
        config_key: adjustment.config_key,
        new_value: adjustment.proposed_value ?? adjustment.new_value,
        modified_by: modifiedBy,
      });
    } catch (applyErr) {
      log.error({ err: applyErr }, 'applyWeightAdjustment failed');
      return res.status(500).json({
        error: `Adjustment approved but apply failed: ${applyErr.message}`,
      });
    }

    // 2. Ingest approval memo into the knowledge base so the
    //    agentic loop treats this weight change as precedent.
    try {
      const memoText = [
        `APPROVED WEIGHT ADJUSTMENT — ${now.split('T')[0]}`,
        ``,
        `Config key: ${adjustment.config_key}`,
        `Layer: ${adjustment.layer || 'unknown'}`,
        `Previous value: ${adjustment.current_value ?? 'unknown'}`,
        `New value: ${applied.new_value}`,
        `Sample size: ${adjustment.sample_size ?? 'n/a'}`,
        `Win rate: ${adjustment.win_rate ?? 'n/a'}%`,
        ``,
        `Reasoning: ${adjustment.reasoning || adjustment.rationale || 'see adjustment row'}`,
        ``,
        `Reviewer notes: ${review_notes || 'none'}`,
        `Approved by: ${modifiedBy}`,
        ``,
        `This change was produced by the agentic learning loop and reviewed`,
        `by a human before being written to scoring_config. Future adjustments`,
        `that target ${adjustment.config_key} should treat this value as the`,
        `current baseline.`,
      ].join('\n');

      const ingestResult = await ingestDocument({
        text: memoText,
        sourceName: `weight_approval_${adjustment.config_key}_${now.split('T')[0]}`,
        sourceType: 'APPROVED_WEIGHT_MEMO',
        sourceDate: now.split('T')[0],
      });

      // Link the knowledge memo back onto the adjustment row if possible.
      const memoSourceName = `weight_approval_${adjustment.config_key}_${now.split('T')[0]}`;
      const { data: memoChunks } = await supabase
        .from('knowledge_chunks')
        .select('id')
        .eq('source_name', memoSourceName)
        .limit(1);
      if (memoChunks?.length) {
        await supabase
          .from('weight_adjustments')
          .update({ knowledge_memo_id: memoChunks[0].id })
          .eq('id', req.params.id);
      }

      return res.json({
        success: true,
        status: 'approved',
        applied,
        memo: { ingested: ingestResult.chunks_stored },
      });
    } catch (ingestErr) {
      log.error({ err: ingestErr }, 'Memo ingest failed');
      // Approval still counts — the scoring_config has been updated.
      return res.json({
        success: true,
        status: 'approved',
        applied,
        memo: { ingested: 0, error: ingestErr.message },
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sprint 10C — Expose current scoring weights (live runtime view)
app.get('/api/learning/scoring-config', async (_req, res) => {
  try {
    const cfg = await getAllConfig();
    res.json({ config: cfg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get learned principles
app.get('/api/learning/principles', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('learned_principles')
      .select('*')
      .order('confidence', { ascending: false })
      .limit(50);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ principles: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Agent Self-Improvement Suggestions ---

// Get agent suggestions (filterable by status)
app.get('/api/agent/suggestions', async (req, res) => {
  try {
    const status = req.query.status;
    let query = supabase.from('agent_suggestions').select('*')
      .order('created_at', { ascending: false });
    if (status) {
      query = query.eq('status', status);
    }
    const { data, error } = await query.limit(100);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ suggestions: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a suggestion's status (APPROVED, IMPLEMENTED, REJECTED)
app.put('/api/agent/suggestions/:id', async (req, res) => {
  const { status } = req.body;
  if (!['APPROVED', 'IMPLEMENTED', 'REJECTED', 'PENDING'].includes(status)) {
    return res.status(400).json({ error: 'Status must be PENDING, APPROVED, IMPLEMENTED, or REJECTED' });
  }
  try {
    const { error } = await supabase
      .from('agent_suggestions')
      .update({ status })
      .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Compare to Greats ---

app.post('/api/compare-greats/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  try {
    const { data: analysis } = await supabase
      .from('stock_analysis')
      .select('greats_comparison')
      .eq('ticker', ticker)
      .single();
    if (analysis?.greats_comparison) {
      return res.json({ ticker, comparison: analysis.greats_comparison });
    }
    // Run fresh comparison
    const { data: stockData } = await supabase
      .from('screener_results')
      .select('*')
      .eq('ticker', ticker)
      .single();
    if (!stockData) return res.status(404).json({ error: `${ticker} not found` });

    const result = await invokeSkill('compare_to_greats', {
      ticker,
      profile: {
        company_name: stockData.company_name,
        sector: stockData.sector,
        market_cap: stockData.market_cap,
        pe_ratio: stockData.pe_ratio,
        revenue_growth_pct: stockData.revenue_growth_pct,
      },
      scoring: { total_score: stockData.total_score, signal: stockData.signal },
      valuation: null,
      moat: null,
    });
    res.json({ ticker, comparison: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// SAIN ENDPOINTS (Sprint 9A)
// ═══════════════════════════════════════════

// --- SAIN Sources ---

app.get('/api/sain/sources', async (_req, res) => {
  try {
    const { data } = await supabase.from('sain_sources').select('*').eq('active', true);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sain/sources', async (req, res) => {
  try {
    const { data, error } = await supabase.from('sain_sources').insert(req.body).select();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SAIN Signals ---

app.get('/api/sain/signals', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const { data } = await supabase.from('sain_signals').select('*')
      .order('signal_date', { ascending: false }).limit(limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sain/signals/politicians', async (_req, res) => {
  try {
    const { data } = await supabase.from('sain_signals').select('*')
      .not('politician_name', 'is', null)
      .order('signal_date', { ascending: false }).limit(50);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sain/signals/ai-models', async (_req, res) => {
  try {
    const { data } = await supabase.from('sain_signals').select('*')
      .not('ai_model_name', 'is', null)
      .is('politician_name', null)
      .order('signal_date', { ascending: false }).limit(50);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sain/signals/:ticker', async (req, res) => {
  try {
    const { data } = await supabase.from('sain_signals').select('*')
      .eq('ticker', req.params.ticker.toUpperCase())
      .order('signal_date', { ascending: false }).limit(20);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- SAIN Consensus ---

app.get('/api/sain/consensus/full-stack', async (_req, res) => {
  try {
    const { data } = await supabase.from('sain_consensus').select('*')
      .eq('is_full_stack_consensus', true)
      .order('total_sain_score', { ascending: false });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sain/consensus/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const { data } = await supabase.from('sain_consensus').select('*')
      .order('total_sain_score', { ascending: false }).limit(limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sain/consensus/:ticker', async (req, res) => {
  try {
    const { data } = await supabase.from('sain_consensus').select('*')
      .eq('ticker', req.params.ticker.toUpperCase())
      .order('computed_date', { ascending: false }).limit(1);
    res.json(data?.[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Manual SAIN Triggers ---

app.post('/api/sain/scan', async (_req, res) => {
  try {
    const social = await invokeSkill('scan_social', { category: 'ALL' });
    const pol = await invokeSkill('scan_politicians', {});
    const consensus = await computeAllConsensus();
    res.json({ social, politicians: pol, consensus_computed: consensus.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sain/scan/:category', async (req, res) => {
  try {
    const result = await invokeSkill('scan_social', { category: req.params.category.toUpperCase() });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Full SAIN scan with activity logging (fire-and-forget)
app.post('/api/admin/sain-scan', async (_req, res) => {
  try {
    res.json({ status: 'started', note: 'Check /api/agent/activity for progress' });

    const { logActivity } = require('./services/agent_logger');
    await logActivity({ type: 'SAIN', title: 'Full SAIN scan triggered', importance: 'NOTABLE' });

    const social = await invokeSkill('scan_social', { category: 'ALL' });
    await logActivity({ type: 'SAIN', title: `Social scan: ${social.signals_found} signals from ${social.sources_scanned} sources`, importance: 'INFO' });

    const pol = await invokeSkill('scan_politicians', {});
    await logActivity({ type: 'SAIN', title: `Politician scan: ${pol.trades_found || 0} trades`, importance: 'INFO' });

    const consensus = await computeAllConsensus();
    const fsc = consensus.filter(c => c.is_full_stack_consensus);
    await logActivity({ type: 'SAIN', title: `Consensus computed: ${consensus.length} tickers, ${fsc.length} full-stack`, importance: fsc.length > 0 ? 'IMPORTANT' : 'INFO' });
  } catch (err) {
    log.error({ err }, 'Admin SAIN scan error');
  }
});

// ═══════════════════════════════════════════
// AGENT ACTIVITY ENDPOINTS
// ═══════════════════════════════════════════

app.get('/api/agent/activity', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const type = req.query.type;
    let query = supabase.from('agent_activity').select('*')
      .order('created_at', { ascending: false }).limit(limit);
    if (type) query = query.eq('activity_type', type);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/agent/activity/important', async (req, res) => {
  try {
    const { data } = await supabase.from('agent_activity').select('*')
      .in('importance', ['IMPORTANT', 'CRITICAL'])
      .order('created_at', { ascending: false }).limit(20);
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// DEBUG ENDPOINT
// ═══════════════════════════════════════════

app.get('/api/admin/debug/analysis/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();

    // Check stock_analysis table
    const { data: analysis, error: aErr } = await supabase
      .from('stock_analysis')
      .select('id, ticker, signal, composite_score, analyzed_at')
      .eq('ticker', ticker);

    // Check screener_results
    const { data: screener, error: sErr } = await supabase
      .from('screener_results')
      .select('ticker, total_score, fundamental_score, technical_score, signal, eps_gaap, net_income, operating_margin, free_cash_flow, revenue_current, revenue_prior_year, current_price, ma_50d, price_200wma, price_200mma, updated_at')
      .eq('ticker', ticker);

    // Try running analyzeStock synchronously and catch any error
    let analyzeResult = null;
    let analyzeError = null;
    try {
      const { analyzeStock } = require('./services/orchestrator');
      analyzeResult = await analyzeStock(ticker);
    } catch (err) {
      analyzeError = { message: err.message, stack: err.stack?.split('\n').slice(0, 10) };
    }

    // Re-read stock_analysis after analyze
    const { data: analysisAfter } = await supabase
      .from('stock_analysis')
      .select('id, ticker, signal, composite_score, analyzed_at')
      .eq('ticker', ticker);

    // Show key fields from the screener data that the orchestrator will use
    const sr = screener?.[0] || {};
    const stockDataSample = {
      eps_gaap: sr.eps_gaap ?? 'MISSING',
      net_income: sr.net_income ?? 'MISSING',
      operating_margin: sr.operating_margin ?? 'MISSING',
      free_cash_flow: sr.free_cash_flow ?? 'MISSING',
      current_price: sr.current_price ?? 'MISSING',
      revenue_growth_pct: sr.revenue_growth_pct ?? 'MISSING',
      gross_margin_current: sr.gross_margin_current ?? 'MISSING',
      total_score: sr.total_score ?? 'MISSING',
      ma_50d: sr.ma_50d ?? 'MISSING',
      price_200wma: sr.price_200wma ?? 'MISSING',
      price_200mma: sr.price_200mma ?? 'MISSING',
    };

    res.json({
      stock_analysis_before: analysis,
      stock_analysis_error: aErr?.message,
      screener_results: screener,
      screener_error: sErr?.message,
      stock_data_sample: stockDataSample,
      analyze_result: analyzeResult ? 'SUCCESS' : 'FAILED',
      analyze_error: analyzeError,
      analyze_score: analyzeResult?.composite_score ?? null,
      analyze_signal: analyzeResult?.signal ?? null,
      stock_analysis_after: analysisAfter,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// /api/stock/:ticker — Quick lookup (public, no auth)
// ═══════════════════════════════════════════
app.get('/api/stock/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  try {
    const [{ data: screener }, { data: valuation }, { data: wave }] = await Promise.all([
      supabase.from('screener_results').select('ticker,company_name,signal,total_score,tli_score,current_price,price_200wma,price_200mma,ma_50d,updated_at').eq('ticker', ticker).single(),
      supabase.from('stock_valuations').select('avg_price_target,avg_upside_pct,tli_rating').eq('ticker', ticker).order('computed_date', { ascending: false }).limit(1).single(),
      supabase.from('wave_counts').select('wave_count_json,claude_interpretation').eq('ticker', ticker).order('last_updated', { ascending: false }).limit(1).single(),
    ]);
    if (!screener) return res.status(404).json({ error: `${ticker} not found in universe` });
    res.json({
      ticker,
      company_name: screener.company_name,
      signal: screener.signal,
      total_score: screener.total_score || screener.tli_score,
      current_price: screener.current_price,
      ma_50: screener.ma_50d,
      ma_200w: screener.price_200wma,
      ma_200m: screener.price_200mma,
      valuation: valuation || null,
      wave: wave?.wave_count_json || null,
      wave_interpretation: wave?.claude_interpretation || null,
      last_scored: screener.updated_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════

app.get('/health', async (_req, res) => {
  const checks = {};

  // Supabase + stock counts
  try {
    const { count } = await supabase.from('screener_results').select('*', { count: 'exact', head: true });
    checks.supabase = { status: 'ok', stocks_scored: count || 0 };
  } catch (e) {
    checks.supabase = { status: 'error', message: e.message };
  }

  // Scraper
  try {
    const resp = await fetch((process.env.SCRAPER_URL || 'http://localhost:8000') + '/health');
    checks.scraper = { status: resp.ok ? 'ok' : 'error' };
  } catch (e) {
    checks.scraper = { status: 'unreachable', message: e.message };
  }

  // API keys
  checks.anthropic = { status: process.env.ANTHROPIC_API_KEY ? 'ok' : 'missing' };
  checks.x_api = { status: process.env.X_BEARER_TOKEN ? 'ok' : 'missing' };

  // Knowledge base
  try {
    const { count } = await supabase.from('knowledge_chunks').select('*', { count: 'exact', head: true });
    checks.knowledge_base = { status: count > 0 ? 'ok' : 'empty', chunks: count || 0 };
  } catch (e) {
    checks.knowledge_base = { status: 'error' };
  }

  // SAIN
  try {
    const { count } = await supabase.from('sain_sources').select('*', { count: 'exact', head: true });
    checks.sain_sources = { status: count > 0 ? 'ok' : 'empty', count: count || 0 };
  } catch (e) {
    checks.sain_sources = { status: 'error' };
  }

  // Last scan
  let lastScan = null;
  try {
    const { data: hist } = await supabase.from('scan_history').select('scanned_at').order('scanned_at', { ascending: false }).limit(1);
    lastScan = hist?.[0]?.scanned_at || null;
  } catch (_) {}

  const allOk = Object.values(checks).every(c => c.status === 'ok');

  res.json({
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    last_scan: lastScan,
    checks,
  });
});

// Admin dashboard — system-wide counts
app.get('/api/admin/dashboard', async (_req, res) => {
  try {
    const [
      { count: totalStocks },
      { count: loadTheBoat },
      { count: accumulate },
      { count: analyses },
      { count: knowledge },
      { count: sainSources },
      { count: sainSignals },
      { count: agentLogs },
    ] = await Promise.all([
      supabase.from('screener_results').select('*', { count: 'exact', head: true }),
      supabase.from('screener_results').select('*', { count: 'exact', head: true }).eq('signal', 'LOAD THE BOAT'),
      supabase.from('screener_results').select('*', { count: 'exact', head: true }).eq('signal', 'ACCUMULATE'),
      supabase.from('stock_analysis').select('*', { count: 'exact', head: true }),
      supabase.from('knowledge_chunks').select('*', { count: 'exact', head: true }),
      supabase.from('sain_sources').select('*', { count: 'exact', head: true }).eq('active', true),
      supabase.from('sain_signals').select('*', { count: 'exact', head: true }),
      supabase.from('agent_activity').select('*', { count: 'exact', head: true }),
    ]);

    res.json({
      scoring: { total: totalStocks, load_the_boat: loadTheBoat, accumulate },
      intelligence: { analyses, knowledge_chunks: knowledge },
      sain: { sources: sainSources, signals: sainSignals },
      agent: { activity_logs: agentLogs },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// ADMIN: RESCORE TOP STOCKS
// ═══════════════════════════════════════════

app.get('/api/admin/rescore-top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const { deepScoreSingle } = require('./pipeline/stage3_deepscore');

    const { data: stocks } = await supabase.from('screener_results')
      .select('ticker')
      .order('total_score', { ascending: false })
      .limit(limit);

    if (!stocks || stocks.length === 0) return res.json({ error: 'No stocks found' });

    const results = [];
    for (const s of stocks) {
      try {
        await deepScoreSingle(s.ticker);
        results.push({ ticker: s.ticker, status: 'OK' });
      } catch (err) {
        results.push({ ticker: s.ticker, status: 'ERROR', error: err.message });
      }
      // Rate limit: 1 per second
      await new Promise(r => setTimeout(r, 1000));
    }

    res.json({ rescored: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// BATCH ANALYSIS ENDPOINTS
// ═══════════════════════════════════════════

app.get('/api/admin/analyze-batch', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const minScore = parseInt(req.query.min_score) || 60;

  try {
    const { data: stocks, error } = await supabase.from('screener_results')
      .select('ticker, total_score, signal')
      .or(`total_score.gte.${minScore}`)
      .order('total_score', { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    if (!stocks?.length) return res.json({ message: 'No stocks found above threshold', minScore });

    // Return immediately, run in background
    res.json({
      status: 'started',
      count: stocks.length,
      tickers: stocks.map(s => s.ticker),
      note: 'Check /api/agent/activity for progress',
    });

    // Process in background
    const { analyzeStock } = require('./services/orchestrator');
    const { logActivity } = require('./services/agent_logger');

    await logActivity({
      type: 'ANALYSIS',
      title: `Batch analysis started: ${stocks.length} stocks`,
      description: `Tickers: ${stocks.map(s => s.ticker).join(', ')}`,
      importance: 'NOTABLE',
    });

    for (const stock of stocks) {
      try {
        await analyzeStock(stock.ticker);
        await logActivity({
          type: 'ANALYSIS',
          title: `Batch: ${stock.ticker} complete`,
          description: `Score: ${stock.total_score}`,
          ticker: stock.ticker,
          importance: 'INFO',
        });
      } catch (err) {
        await logActivity({
          type: 'ERROR',
          title: `Batch: ${stock.ticker} failed`,
          description: err.message,
          ticker: stock.ticker,
          importance: 'CRITICAL',
        });
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    await logActivity({
      type: 'ANALYSIS',
      title: `Batch analysis complete: ${stocks.length} stocks`,
      description: 'All stocks processed',
      importance: 'IMPORTANT',
    });
  } catch (err) {
    log.error({ err }, 'Batch analysis error');
  }
});

app.get('/api/admin/rescore-batch', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;

  try {
    const { data: stocks, error } = await supabase.from('screener_results')
      .select('ticker')
      .order('updated_at', { ascending: true })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    if (!stocks?.length) return res.json({ message: 'No stocks to rescore' });

    res.json({ status: 'started', count: stocks.length });

    const { deepScoreSingle } = require('./pipeline/stage3_deepscore');

    for (const s of stocks) {
      try {
        await deepScoreSingle(s.ticker);
      } catch (err) {
        log.error({ err, ticker: s.ticker }, 'Rescore failed');
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (err) {
    log.error({ err }, 'Batch rescore error');
  }
});

// ═══════════════════════════════════════════
// TELEGRAM ENDPOINTS
// ═══════════════════════════════════════════

app.post('/api/admin/telegram-test', async (_req, res) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      return res.json({ success: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured' });
    }

    const message = `\u{1F6A8} <b>SimuAlpha Test Message</b>\n\nTelegram integration is working.\nTimestamp: ${new Date().toISOString()}`;
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return res.json({ success: false, error: err });
    }

    res.json({ success: true, message: 'Test message sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send FSC alert for tickers with full-stack consensus
app.post('/api/admin/telegram-fsc', async (_req, res) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      return res.json({ success: false, error: 'Telegram not configured' });
    }

    const { data: fsc } = await supabase.from('sain_consensus').select('*')
      .eq('is_full_stack_consensus', true)
      .order('total_sain_score', { ascending: false });

    if (!fsc || fsc.length === 0) {
      return res.json({ success: false, message: 'No full-stack consensus tickers' });
    }

    const lines = fsc.map(f => `  \u2022 <b>${f.ticker}</b> \u2014 Score: ${f.total_sain_score} | Dir: ${f.consensus_direction || 'N/A'} | Layers: ${f.layers_aligned || 0}`);
    const message = `\u{1F31F} <b>Full-Stack Consensus Alert</b>\n\n${fsc.length} ticker(s) have all 4 SAIN layers aligned:\n\n${lines.join('\n')}\n\n<i>Super Investors + Politicians + AI Models + TLI all agree.</i>`;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });

    res.json({ success: true, sent: fsc.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// WATCHLIST ENDPOINTS
// ═══════════════════════════════════════════

// Get all watchlist items with joined screener data
app.get('/api/watchlist', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('watchlist')
      .select('*, screener_results(ticker, company_name, total_score, signal, sector, current_price, pct_from_200wma, pct_from_200mma, entry_zone, fundamental_score, technical_score)')
      .order('added_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ watchlist: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add ticker to watchlist
app.post('/api/watchlist', async (req, res) => {
  try {
    const { ticker, notes } = req.body;
    if (!ticker) return res.status(400).json({ error: 'ticker is required' });
    const { data, error } = await supabase
      .from('watchlist')
      .insert({ ticker: ticker.toUpperCase(), notes: notes || '' })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove ticker from watchlist
app.delete('/api/watchlist/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('watchlist')
      .delete()
      .eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update watchlist item notes
app.put('/api/watchlist/:id', async (req, res) => {
  try {
    const { notes } = req.body;
    const { data, error } = await supabase
      .from('watchlist')
      .update({ notes: notes ?? '' })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ item: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if ticker is on watchlist
app.get('/api/watchlist/check/:ticker', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('watchlist')
      .select('id')
      .eq('ticker', req.params.ticker.toUpperCase())
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ watchlisted: !!data, id: data?.id || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// CUSTOM ALERTS ENDPOINTS
// ═══════════════════════════════════════════

// Get all alerts (optionally filter by ticker)
app.get('/api/alerts', async (req, res) => {
  try {
    let query = supabase.from('custom_alerts').select('*').order('created_at', { ascending: false });
    if (req.query.ticker) query = query.eq('ticker', req.query.ticker.toUpperCase());
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ alerts: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create alert
app.post('/api/alerts', async (req, res) => {
  try {
    const { ticker, metric, condition, threshold, telegram } = req.body;
    if (!ticker || !metric || !condition || threshold == null) {
      return res.status(400).json({ error: 'ticker, metric, condition, threshold required' });
    }
    const { data, error } = await supabase.from('custom_alerts').insert({
      ticker: ticker.toUpperCase(), metric, condition, threshold: String(threshold),
      telegram: !!telegram,
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ alert: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete alert
app.delete('/api/alerts/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('custom_alerts').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle alert active/inactive
app.patch('/api/alerts/:id/toggle', async (req, res) => {
  try {
    const { data: existing } = await supabase.from('custom_alerts').select('active').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('custom_alerts')
      .update({ active: !existing.active })
      .eq('id', req.params.id)
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ alert: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check all active alerts (called after pipeline or manually)
app.post('/api/alerts/check', async (req, res) => {
  try {
    const { data: alerts } = await supabase.from('custom_alerts').select('*').eq('active', true);
    if (!alerts || alerts.length === 0) return res.json({ checked: 0, fired: 0 });

    const tickers = [...new Set(alerts.map(a => a.ticker))];
    const { data: stocks } = await supabase.from('screener_results').select('*').in('ticker', tickers);
    const stockMap = {};
    (stocks || []).forEach(s => { stockMap[s.ticker] = s; });

    let fired = 0;
    const { logActivity } = require('./services/agent_logger');

    for (const alert of alerts) {
      const stock = stockMap[alert.ticker];
      if (!stock) continue;

      const val = stock[alert.metric];
      const threshold = isNaN(alert.threshold) ? alert.threshold : Number(alert.threshold);
      let triggered = false;

      if (alert.condition === 'above' && typeof val === 'number' && val > threshold) triggered = true;
      else if (alert.condition === 'below' && typeof val === 'number' && val < threshold) triggered = true;
      else if (alert.condition === 'equals' && String(val) === String(threshold)) triggered = true;

      if (triggered) {
        fired++;
        await supabase.from('custom_alerts').update({ last_fired: new Date().toISOString() }).eq('id', alert.id);

        if (alert.telegram) {
          const token = process.env.TELEGRAM_BOT_TOKEN;
          const chatId = process.env.TELEGRAM_CHAT_ID;
          if (token && chatId) {
            const msg = `\u{1F514} <b>Alert: ${alert.ticker}</b>\n${alert.metric} ${alert.condition} ${alert.threshold}\nCurrent: ${val}`;
            fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' }),
            }).catch(() => {});
          }
        }

        logActivity({
          type: 'ALERT_FIRED', title: `Alert fired: ${alert.ticker}`,
          description: `${alert.metric} ${alert.condition} ${alert.threshold} (current: ${val})`,
          ticker: alert.ticker, importance: 'NOTABLE',
        });
      }
    }

    res.json({ checked: alerts.length, fired });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// EXPORT ENDPOINTS
// ═══════════════════════════════════════════

// PDF-ready HTML report for a single ticker
app.get('/api/export/pdf/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const { data: stock, error } = await supabase
      .from('screener_results')
      .select('*')
      .eq('ticker', ticker)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!stock) return res.status(404).json({ error: `${ticker} not found` });

    const { data: analysis } = await supabase
      .from('stock_analysis')
      .select('bull_case, bear_case, one_liner, thesis_summary')
      .eq('ticker', ticker)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const signalColor = {
      'LOAD THE BOAT': '#10b981', 'ACCUMULATE': '#3b82f6', 'WATCH': '#f59e0b',
      'HOLD': '#8b5cf6', 'CAUTION': '#f97316', 'TRIM': '#ef4444', 'AVOID': '#6b7280'
    }[stock.signal] || '#888';

    const fmtNum = (v, d = 1) => v != null ? Number(v).toFixed(d) : '\u2014';
    const fmtPct = (v) => v != null ? `${Number(v).toFixed(1)}%` : '\u2014';
    const fmtPrice = (v) => v != null ? `$${Number(v).toFixed(2)}` : '\u2014';
    const now = new Date().toISOString().split('T')[0];

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${ticker} - TLI Report</title>
  <style>
    body { font-family: 'Helvetica Neue', sans-serif; color: #1a1a2e; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.6; }
    h1 { font-size: 36px; font-weight: 300; margin: 0 0 4px; }
    .sub { font-size: 13px; color: #666; margin-bottom: 24px; }
    .signal { display: inline-block; padding: 4px 14px; border-radius: 4px; font-size: 12px; font-weight: 600; color: #fff; background: ${signalColor}; }
    .score-box { display: inline-block; border: 2px solid ${signalColor}; border-radius: 50%; width: 60px; height: 60px; text-align: center; line-height: 56px; font-size: 22px; font-weight: 600; margin-right: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e5e5; font-size: 13px; }
    th { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.08em; }
    .section { margin: 28px 0; }
    .section-title { font-size: 20px; font-weight: 400; margin-bottom: 12px; border-bottom: 1px solid #e5e5e5; padding-bottom: 8px; }
    .green { color: #10b981; } .red { color: #ef4444; } .amber { color: #f59e0b; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 10px; color: #aaa; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 12px;">
    <div class="score-box">${stock.total_score || 0}</div>
    <div>
      <h1>${ticker}</h1>
      <div class="sub">${stock.company_name || ''} ${stock.sector ? '&middot; ' + stock.sector : ''}</div>
    </div>
    <div class="signal" style="margin-left: auto;">${stock.signal || 'N/A'}</div>
  </div>

  <div class="section">
    <div class="section-title">Score Breakdown</div>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Total Score</td><td><strong>${stock.total_score}/100</strong></td></tr>
      <tr><td>Fundamental Score</td><td>${stock.fundamental_score}/50</td></tr>
      <tr><td>Technical Score</td><td>${stock.technical_score}/50</td></tr>
      <tr><td>Entry Zone</td><td>${stock.entry_zone ? '<span class="green">Yes</span>' : 'No'}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Price &amp; Technical Data</div>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Current Price</td><td>${fmtPrice(stock.current_price)}</td></tr>
      <tr><td>200-Week MA</td><td>${fmtPrice(stock.price_200wma)} (${fmtPct(stock.pct_from_200wma)})</td></tr>
      <tr><td>200-Month MA</td><td>${fmtPrice(stock.price_200mma)} (${fmtPct(stock.pct_from_200mma)})</td></tr>
      <tr><td>52-Week High</td><td>${fmtPrice(stock.week_52_high)} (${fmtPct(stock.pct_from_52w_high)})</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Fundamentals</div>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Revenue Growth (YoY)</td><td>${fmtPct(stock.revenue_growth_pct)}</td></tr>
      <tr><td>P/E Ratio</td><td>${fmtNum(stock.pe_ratio)}</td></tr>
      <tr><td>P/S Ratio</td><td>${fmtNum(stock.ps_ratio)}</td></tr>
      <tr><td>Gross Margin</td><td>${fmtPct(stock.gross_margin_current)}</td></tr>
      <tr><td>Operating Margin</td><td>${fmtPct(stock.operating_margin)}</td></tr>
      <tr><td>FCF Margin</td><td>${fmtPct(stock.fcf_margin)}</td></tr>
    </table>
  </div>

  ${analysis ? `
  <div class="section">
    <div class="section-title">AI Investment Thesis</div>
    ${analysis.one_liner ? `<p style="font-style: italic; color: #444;">&ldquo;${analysis.one_liner}&rdquo;</p>` : ''}
    ${analysis.thesis_summary ? `<p style="font-size: 13px;">${analysis.thesis_summary}</p>` : ''}
    ${analysis.bull_case ? `<p style="font-size: 12px;"><strong class="green">Bull Case:</strong> ${analysis.bull_case}</p>` : ''}
    ${analysis.bear_case ? `<p style="font-size: 12px;"><strong class="red">Bear Case:</strong> ${analysis.bear_case}</p>` : ''}
  </div>` : ''}

  <div class="footer">
    The Long Screener &mdash; TLI Report for ${ticker} &mdash; Generated ${now}<br/>
    Not financial advice. AI-generated analysis for educational purposes only.
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `inline; filename="${ticker}_TLI_Report_${now}.html"`);
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CSV export for screener results
app.get('/api/export/screener/csv', async (req, res) => {
  try {
    let query = supabase
      .from('screener_results')
      .select('ticker, company_name, sector, total_score, fundamental_score, technical_score, signal, entry_zone, current_price, price_200wma, pct_from_200wma, price_200mma, pct_from_200mma, revenue_growth_pct, pe_ratio, ps_ratio, gross_margin_current, operating_margin, fcf_margin, week_52_high, pct_from_52w_high')
      .order('total_score', { ascending: false });

    if (req.query.signal) query = query.eq('signal', req.query.signal);
    if (req.query.min_score) query = query.gte('total_score', Number(req.query.min_score));
    if (req.query.sector) query = query.eq('sector', req.query.sector);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(404).json({ error: 'No results' });

    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    for (const row of data) {
      csvRows.push(headers.map(h => {
        const v = row[h];
        if (v == null) return '';
        if (typeof v === 'string' && (v.includes(',') || v.includes('"'))) return `"${v.replace(/"/g, '""')}"`;
        return String(v);
      }).join(','));
    }
    const csv = csvRows.join('\n');

    const now = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="screener_export_${now}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// COMPARISON ENDPOINT
// ═══════════════════════════════════════════

app.get('/api/compare/:ticker1/:ticker2', async (req, res) => {
  try {
    const t1 = req.params.ticker1.toUpperCase();
    const t2 = req.params.ticker2.toUpperCase();
    const { data, error } = await supabase
      .from('screener_results')
      .select('*')
      .in('ticker', [t1, t2]);
    if (error) return res.status(500).json({ error: error.message });
    const s1 = (data || []).find(d => d.ticker === t1) || null;
    const s2 = (data || []).find(d => d.ticker === t2) || null;
    if (!s1 && !s2) return res.status(404).json({ error: 'Neither ticker found' });

    // Compute winner summary
    const metrics = [
      { label: 'Total Score', key: 'total_score', higher: true },
      { label: 'Fundamental Score', key: 'fundamental_score', higher: true },
      { label: 'Technical Score', key: 'technical_score', higher: true },
      { label: 'Revenue Growth', key: 'revenue_growth_pct', higher: true },
      { label: '% from 200WMA', key: 'pct_from_200wma', higher: false },
      { label: '% from 200MMA', key: 'pct_from_200mma', higher: false },
      { label: 'P/E Ratio', key: 'pe_ratio', higher: false },
      { label: 'P/S Ratio', key: 'ps_ratio', higher: false },
      { label: 'Gross Margin', key: 'gross_margin_current', higher: true },
    ];
    let wins1 = 0, wins2 = 0;
    const comparison = metrics.map(m => {
      const v1 = s1?.[m.key];
      const v2 = s2?.[m.key];
      let winner = null;
      if (v1 != null && v2 != null) {
        if (m.higher) winner = v1 > v2 ? t1 : v2 > v1 ? t2 : null;
        else winner = v1 < v2 ? t1 : v2 < v1 ? t2 : null;
        if (winner === t1) wins1++;
        else if (winner === t2) wins2++;
      }
      return { ...m, v1, v2, winner };
    });

    res.json({
      stock1: s1, stock2: s2,
      comparison, wins: { [t1]: wins1, [t2]: wins2 },
      overall: wins1 > wins2 ? t1 : wins2 > wins1 ? t2 : 'TIE',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// SEARCH ENDPOINT
// ═══════════════════════════════════════════

app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toUpperCase();
    if (!q || q.length < 1) return res.json({ results: [] });

    // Search by ticker (exact prefix) and company name (ilike)
    const { data, error } = await supabase
      .from('screener_results')
      .select('ticker, company_name, total_score, signal, sector, current_price')
      .or(`ticker.ilike.${q}%,company_name.ilike.%${q}%`)
      .order('total_score', { ascending: false })
      .limit(15);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ results: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// PORTFOLIO ENDPOINTS
// ═══════════════════════════════════════════

// Get all open positions with current price and P&L
app.get('/api/portfolio', async (req, res) => {
  try {
    const { data: positions } = await supabase.from('portfolio_positions')
      .select('*').eq('status', 'OPEN').order('created_at', { ascending: false });

    if (!positions?.length) return res.json({ positions: [], summary: {} });

    const tickers = [...new Set(positions.map(p => p.ticker))];
    const { data: prices } = await supabase.from('screener_results')
      .select('ticker, current_price, total_score, signal')
      .in('ticker', tickers);

    const priceMap = {};
    for (const p of (prices || [])) priceMap[p.ticker] = p;

    const enriched = positions.map(pos => {
      const current = priceMap[pos.ticker];
      const currentPrice = current?.current_price || pos.entry_price;
      const marketValue = currentPrice * pos.shares;
      const costBasis = pos.entry_price * pos.shares;
      const pnl = marketValue - costBasis;
      const pnlPct = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
      return {
        ...pos, current_price: currentPrice,
        current_score: current?.total_score, current_signal: current?.signal,
        market_value: marketValue, cost_basis: costBasis, pnl, pnl_pct: pnlPct,
      };
    });

    const totalValue = enriched.reduce((sum, p) => sum + p.market_value, 0);
    const totalCost = enriched.reduce((sum, p) => sum + p.cost_basis, 0);
    res.json({
      positions: enriched,
      summary: {
        total_positions: enriched.length, total_value: totalValue, total_cost: totalCost,
        total_pnl: totalValue - totalCost,
        total_pnl_pct: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
        unique_tickers: tickers.length,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Add a position
app.post('/api/portfolio', async (req, res) => {
  try {
    const { ticker, entry_price, shares, entry_date, tranche_number, notes } = req.body;
    if (!ticker || !entry_price || !shares) return res.status(400).json({ error: 'ticker, entry_price, shares required' });

    const { data: stock } = await supabase.from('screener_results')
      .select('total_score, signal').eq('ticker', ticker.toUpperCase()).maybeSingle();

    const { data, error } = await supabase.from('portfolio_positions').insert({
      ticker: ticker.toUpperCase(), entry_price, shares,
      entry_date: entry_date || new Date().toISOString().split('T')[0],
      tranche_number: tranche_number || 1,
      score_at_entry: stock?.total_score, signal_at_entry: stock?.signal, notes,
    }).select();
    if (error) return res.status(500).json({ error: error.message });

    await supabase.from('portfolio_transactions').insert({
      position_id: data?.[0]?.id, ticker: ticker.toUpperCase(), action: 'BUY',
      shares, price: entry_price, tranche_number: tranche_number || 1,
      date: entry_date || new Date().toISOString().split('T')[0], notes,
    });

    res.json({ position: data?.[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Trim/close a position
app.put('/api/portfolio/:id/trim', async (req, res) => {
  try {
    const { shares_to_sell, price, reason } = req.body;
    const { data: pos } = await supabase.from('portfolio_positions')
      .select('*').eq('id', req.params.id).single();
    if (!pos) return res.status(404).json({ error: 'Position not found' });

    const remainingShares = pos.shares - shares_to_sell;
    const newStatus = remainingShares <= 0 ? 'CLOSED' : 'TRIMMED';

    await supabase.from('portfolio_positions').update({
      shares: Math.max(remainingShares, 0), status: newStatus,
      exit_price: remainingShares <= 0 ? price : null,
      exit_date: remainingShares <= 0 ? new Date().toISOString().split('T')[0] : null,
      exit_reason: reason,
    }).eq('id', req.params.id);

    await supabase.from('portfolio_transactions').insert({
      position_id: req.params.id, ticker: pos.ticker,
      action: remainingShares <= 0 ? 'CLOSE' : 'TRIM',
      shares: shares_to_sell, price,
      date: new Date().toISOString().split('T')[0], notes: reason,
    });

    res.json({ status: newStatus, remaining_shares: Math.max(remainingShares, 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Transaction history
app.get('/api/portfolio/history', async (_req, res) => {
  try {
    const { data } = await supabase.from('portfolio_transactions')
      .select('*').order('date', { ascending: false }).limit(100);
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Closed positions
app.get('/api/portfolio/closed', async (_req, res) => {
  try {
    const { data } = await supabase.from('portfolio_positions')
      .select('*').eq('status', 'CLOSED').order('exit_date', { ascending: false });
    const enriched = (data || []).map(pos => ({
      ...pos,
      pnl: (pos.exit_price - pos.entry_price) * pos.shares,
      pnl_pct: ((pos.exit_price - pos.entry_price) / pos.entry_price) * 100,
      hold_days: Math.floor((new Date(pos.exit_date) - new Date(pos.entry_date)) / 86400000),
    }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// BACKTESTING ENDPOINTS
// ═══════════════════════════════════════════

app.get('/api/backtesting/accuracy', async (_req, res) => {
  try {
    const { data: outcomes } = await supabase.from('signal_outcomes')
      .select('*').not('return_3mo', 'is', null);

    if (!outcomes?.length) {
      return res.json({ message: 'Insufficient data — signals need 3+ months to mature', total_signals: 0 });
    }

    const bySignal = {};
    for (const o of outcomes) {
      if (!bySignal[o.signal_type]) bySignal[o.signal_type] = { wins: 0, losses: 0, total: 0, returns: [] };
      const b = bySignal[o.signal_type];
      b.total++; b.returns.push(o.return_3mo);
      if (o.return_3mo > 0) b.wins++; else b.losses++;
    }

    for (const [, data] of Object.entries(bySignal)) {
      data.avg_return = data.returns.reduce((a, b) => a + b, 0) / data.returns.length;
      data.win_rate = (data.wins / data.total) * 100;
      data.best = Math.max(...data.returns);
      data.worst = Math.min(...data.returns);
      delete data.returns;
    }

    const allReturns = outcomes.map(o => o.return_3mo);
    const avgReturn = allReturns.reduce((a, b) => a + b, 0) / allReturns.length;
    const wins = allReturns.filter(r => r > 0).length;

    res.json({
      total_signals: outcomes.length,
      overall_win_rate: ((wins / outcomes.length) * 100).toFixed(1),
      overall_avg_return_3mo: avgReturn.toFixed(2),
      by_signal_type: bySignal,
      benchmark_3mo: 2.5,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/backtesting/wave-accuracy', async (_req, res) => {
  try {
    const { data: outcomes } = await supabase.from('signal_outcomes')
      .select('*').not('wave_target_hit', 'is', null);
    if (!outcomes?.length) return res.json({ message: 'No wave target data yet', total: 0 });

    const hits = outcomes.filter(o => o.wave_target_hit === true).length;
    res.json({
      total: outcomes.length, targets_hit: hits,
      targets_missed: outcomes.length - hits,
      accuracy: ((hits / outcomes.length) * 100).toFixed(1),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/backtesting/top-signals', async (_req, res) => {
  try {
    const { data } = await supabase.from('signal_outcomes')
      .select('ticker, signal_type, price_at_signal, return_3mo, return_6mo, return_12mo, signal_date')
      .not('return_3mo', 'is', null)
      .order('return_3mo', { ascending: false }).limit(20);
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// DIGEST ENDPOINTS
// ═══════════════════════════════════════════

app.get('/api/admin/digest-preview', async (_req, res) => {
  try {
    const { generateWeeklyDigest, buildDigestHTML } = require('./services/email_digest');
    const digest = await generateWeeklyDigest();
    const html = buildDigestHTML(digest);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/digest', async (_req, res) => {
  try {
    const { generateWeeklyDigest } = require('./services/email_digest');
    const digest = await generateWeeklyDigest();
    res.json(digest);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/send-digest', async (_req, res) => {
  try {
    const { generateWeeklyDigest } = require('./services/email_digest');
    const digest = await generateWeeklyDigest();
    let text = '\u{1F4CA} *SimuAlpha Weekly Digest*\n\n*Top Opportunities:*\n';
    for (const s of digest.top_opportunities) {
      text += `\u2022 ${s.ticker} \u2014 Score: ${s.total_score} \u2014 ${s.signal?.replace(/_/g, ' ')}\n`;
    }
    if (digest.full_stack_consensus?.length) {
      text += `\n\u{1F3C6} *Full Stack Consensus:* ${digest.full_stack_consensus.map(f => f.ticker).join(', ')}\n`;
    }
    text += `\n\u{1F4E1} SAIN: ${digest.sain_signals_count} new signals this week`;

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (token && chatId) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      });
    }
    res.json({ sent: true, digest });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// CHAT ENDPOINTS
// ═══════════════════════════════════════════

app.post('/api/chat/sessions', async (req, res) => {
  try {
    const { data, error } = await supabase.from('chat_sessions')
      .insert({ title: req.body?.title || 'New Chat' }).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data?.[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/chat/:sessionId/message', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const sessionId = req.params.sessionId;

    await supabase.from('chat_messages').insert({
      session_id: sessionId, role: 'user', content: message,
    });

    const { routeMessage } = require('./services/chat_router');
    const result = await routeMessage(message, sessionId);

    await supabase.from('chat_messages').insert({
      session_id: sessionId, role: 'assistant', content: result.response,
      skills_used: result.skills_used, tickers_mentioned: result.tickers,
    });

    await supabase.from('chat_sessions')
      .update({ updated_at: new Date().toISOString() }).eq('id', sessionId);

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/chat/:sessionId/messages', async (req, res) => {
  try {
    const { data } = await supabase.from('chat_messages')
      .select('*').eq('session_id', req.params.sessionId)
      .order('created_at', { ascending: true });
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/chat/sessions', async (_req, res) => {
  try {
    const { data } = await supabase.from('chat_sessions')
      .select('*').order('updated_at', { ascending: false }).limit(20);
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════
// SUBSCRIPTION TIERS
// ═══════════════════════════════════════════

app.get('/api/tiers', async (_req, res) => {
  try {
    const { data } = await supabase.from('subscription_tiers').select('*')
      .order('price_monthly', { ascending: true });
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
  log.info({ port: PORT }, 'The Long Screener backend listening');

  // Start cron schedules
  startCron();

  // Run full pipeline immediately on startup
  log.info('Running initial pipeline on startup');
  runFullPipeline().catch((err) => log.error({ err }, 'Initial pipeline error'));
});
