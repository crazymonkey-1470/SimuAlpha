require('dotenv').config();
const express = require('express');
const { runFullPipeline, startCron } = require('./cron');
const supabase = require('./services/supabase');

const app = express();
const PORT = process.env.PORT || 3000;

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
