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
  const investors = await getInvestors();
  res.json({ investors });
});

// Latest holdings for a specific investor
app.get('/api/investors/:id/holdings', async (req, res) => {
  const { data, error } = await supabase
    .from('investor_holdings')
    .select('*')
    .eq('investor_id', req.params.id)
    .order('portfolio_rank', { ascending: true })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ holdings: data || [] });
});

// Quarterly signals for a specific investor
app.get('/api/investors/:id/signals', async (req, res) => {
  const { data, error } = await supabase
    .from('investor_signals')
    .select('*')
    .eq('investor_id', req.params.id)
    .order('quarter', { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ signals: data || [] });
});

// Cross-investor consensus for a specific ticker
app.get('/api/consensus/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const { data, error } = await supabase
    .from('consensus_signals')
    .select('*')
    .eq('ticker', ticker)
    .order('quarter', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ticker, consensus: data || [] });
});

// Sector-level consensus
app.get('/api/consensus/sectors', async (_req, res) => {
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
});

// Top consensus picks
app.get('/api/consensus/top-picks', async (_req, res) => {
  const { data, error } = await supabase
    .from('consensus_signals')
    .select('*')
    .order('consensus_score', { ascending: false })
    .limit(20);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ topPicks: data || [] });
});

// Manual holdings entry endpoint
app.post('/api/admin/investor-holdings', async (req, res) => {
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
});

// Trigger institutional data refresh
app.post('/api/admin/refresh-institutional', async (_req, res) => {
  res.json({ status: 'started' });
  refreshAllInvestors().catch(err =>
    log.error({ err }, 'Institutional refresh error')
  );
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
  const counts = {};
  for (const table of ['knowledge_chunks', 'sain_sources', 'investor_holdings', 'scoring_config']) {
    const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
    counts[table] = count || 0;
  }
  res.json(counts);
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
});

// Seed all scripts in one call
app.get('/api/admin/seed-all', async (req, res) => {
  const results = {};
  const scripts = ['seed_sain_sources', 'seed_13f', 'seed_doc_1_scoring', 'seed_doc_3_nvda'];
  results._version = 'v2-cache-clear';

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
  res.json({ status: 'started' });
  batchComputeValuations().catch(err =>
    log.error({ err }, 'Batch valuation error')
  );
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
  const { data } = await supabase.from('sain_sources').select('*').eq('active', true);
  res.json(data);
});

app.post('/api/sain/sources', async (req, res) => {
  const { data, error } = await supabase.from('sain_sources').insert(req.body).select();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data[0]);
});

// --- SAIN Signals ---

app.get('/api/sain/signals', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const { data } = await supabase.from('sain_signals').select('*')
    .order('signal_date', { ascending: false }).limit(limit);
  res.json(data);
});

app.get('/api/sain/signals/politicians', async (_req, res) => {
  const { data } = await supabase.from('sain_signals').select('*')
    .not('politician_name', 'is', null)
    .order('signal_date', { ascending: false }).limit(50);
  res.json(data);
});

app.get('/api/sain/signals/ai-models', async (_req, res) => {
  const { data } = await supabase.from('sain_signals').select('*')
    .not('ai_model_name', 'is', null)
    .is('politician_name', null)
    .order('signal_date', { ascending: false }).limit(50);
  res.json(data);
});

app.get('/api/sain/signals/:ticker', async (req, res) => {
  const { data } = await supabase.from('sain_signals').select('*')
    .eq('ticker', req.params.ticker.toUpperCase())
    .order('signal_date', { ascending: false }).limit(20);
  res.json(data);
});

// --- SAIN Consensus ---

app.get('/api/sain/consensus/full-stack', async (_req, res) => {
  const { data } = await supabase.from('sain_consensus').select('*')
    .eq('is_full_stack_consensus', true)
    .order('total_sain_score', { ascending: false });
  res.json(data);
});

app.get('/api/sain/consensus/top', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const { data } = await supabase.from('sain_consensus').select('*')
    .order('total_sain_score', { ascending: false }).limit(limit);
  res.json(data);
});

app.get('/api/sain/consensus/:ticker', async (req, res) => {
  const { data } = await supabase.from('sain_consensus').select('*')
    .eq('ticker', req.params.ticker.toUpperCase())
    .order('computed_date', { ascending: false }).limit(1);
  res.json(data?.[0] || null);
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
// DEBUG ENDPOINT
// ═══════════════════════════════════════════

app.get('/api/admin/debug/analysis/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();

  // Check stock_analysis table
  const { data: analysis, error: aErr } = await supabase
    .from('stock_analysis')
    .select('id, ticker, signal, composite_score, analyzed_at')
    .eq('ticker', ticker);

  // Check screener_results
  const { data: screener, error: sErr } = await supabase
    .from('screener_results')
    .select('ticker, tli_score, signal, eps_gaap, net_income, operating_margin, free_cash_flow, ma_50d, price_200wma, updated_at')
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

  res.json({
    stock_analysis_before: analysis,
    stock_analysis_error: aErr?.message,
    screener_results: screener,
    screener_error: sErr?.message,
    analyze_result: analyzeResult ? 'SUCCESS' : 'FAILED',
    analyze_error: analyzeError,
    stock_analysis_after: analysisAfter,
  });
});

// ═══════════════════════════════════════════

app.get('/health', async (_req, res) => {
  let candidatesCount = 0;
  let resultsCount = 0;
  let lastScan = null;

  try {
    const [{ count: cc }, { count: rc }, { data: hist }] = await Promise.all([
      supabase.from('screener_candidates').select('*', { count: 'exact', head: true }),
      supabase.from('screener_results').select('*', { count: 'exact', head: true }),
      supabase.from('scan_history').select('scanned_at').order('scanned_at', { ascending: false }).limit(1),
    ]);
    candidatesCount = cc || 0;
    resultsCount = rc || 0;
    lastScan = hist?.[0]?.scanned_at || null;
  } catch (_) { /* ignore */ }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    last_scan: lastScan,
    candidates_count: candidatesCount,
    results_count: resultsCount,
  });
});

app.listen(PORT, () => {
  log.info({ port: PORT }, 'The Long Screener backend listening');

  // Start cron schedules
  startCron();

  // Run full pipeline immediately on startup
  log.info('Running initial pipeline on startup');
  runFullPipeline().catch((err) => log.error({ err }, 'Initial pipeline error'));
});
