require('dotenv').config();
const express = require('express');
const { runFullPipeline, startCron } = require('./cron');
const supabase = require('./services/supabase');
const { getInvestors, refreshAllInvestors } = require('./services/institutional');
const { getLatestMacroContext, getMacroContextHistory, upsertMacroContext } = require('./services/macro');
const { getValuation, computeAndSaveValuation, batchComputeValuations } = require('./services/valuation');
const { getSignalHistory, getAccuracyStats } = require('./services/signalTracker');

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
    console.error('[API] Institutional refresh error:', err.message)
  );
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
    console.error('[API] Batch valuation error:', err.message)
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
  console.log(`[TLI] The Long Screener backend listening on port ${PORT}`);

  // Start cron schedules
  startCron();

  // Run full pipeline immediately on startup
  console.log('[TLI] Running initial pipeline on startup...');
  runFullPipeline().catch((err) => console.error('[TLI] Initial pipeline error:', err.message));
});
