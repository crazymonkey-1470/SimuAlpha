require('dotenv').config();
const express = require('express');
const { runFullPipeline, startCron } = require('./cron');
const supabase = require('./services/supabase');
const { getInvestors, refreshAllInvestors } = require('./services/institutional');

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
