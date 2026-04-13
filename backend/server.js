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
  const allowed = ['seed_13f', 'seed_sain_sources', 'seed_spec_documents', 'seed_doc_1_scoring', 'seed_doc_2_fundamental', 'seed_doc_3_nvda'];
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
  const scripts = ['seed_sain_sources', 'seed_13f', 'seed_doc_1_scoring', 'seed_doc_2_fundamental', 'seed_doc_3_nvda'];
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

app.listen(PORT, () => {
  log.info({ port: PORT }, 'The Long Screener backend listening');

  // Start cron schedules
  startCron();

  // Run full pipeline immediately on startup
  log.info('Running initial pipeline on startup');
  runFullPipeline().catch((err) => log.error({ err }, 'Initial pipeline error'));
});
