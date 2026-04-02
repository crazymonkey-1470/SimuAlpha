const supabase = require('../services/supabase');
const { fetchProfile, fetchIncomeStatement, sleep } = require('../services/fetcher');

/**
 * Stage 2 — Pre-screen
 * Reads universe, applies lightweight filters via FMP data,
 * stores survivors (~200-400) in `screener_candidates`.
 */
async function runPrescreen() {
  console.log('\n[Stage 2] Starting pre-screen of universe...');
  const startTime = Date.now();

  // Read all universe tickers
  const { data: universe, error: readErr } = await supabase
    .from('universe')
    .select('ticker');

  if (readErr || !universe) {
    console.error('[Stage 2] Failed to read universe:', readErr?.message);
    return 0;
  }

  console.log(`[Stage 2] Processing ${universe.length} universe tickers...`);

  const candidates = [];
  let processed = 0;

  // Process in sequential order with delays to respect rate limits
  for (const { ticker } of universe) {
    processed++;
    if (processed % 100 === 0) {
      console.log(`[Stage 2] Progress: ${processed}/${universe.length} processed, ${candidates.length} candidates so far`);
    }

    try {
      const [profile, income] = await Promise.all([
        fetchProfile(ticker),
        fetchIncomeStatement(ticker),
      ]);

      if (!profile) { await sleep(200); continue; }

      // Pre-screen filters
      const marketCap = profile.marketCap;
      const price = profile.currentPrice;
      const week52High = profile.week52High;
      const revGrowth = income.revenueGrowthPct;
      const revCurrent = income.revenueCurrent;

      // Must pass ALL filters
      if (marketCap == null || marketCap < 1e9) { await sleep(200); continue; }
      if (price == null || price <= 3) { await sleep(200); continue; }
      if (revCurrent == null || revCurrent <= 0) { await sleep(200); continue; }
      if (revGrowth == null || revGrowth <= 0) { await sleep(200); continue; }

      // Price must be at least 20% below 52-week high
      let pctFrom52w = null;
      if (week52High != null && week52High > 0) {
        pctFrom52w = ((price - week52High) / week52High) * 100;
      }
      if (pctFrom52w == null || pctFrom52w > -20) { await sleep(200); continue; }

      // Passed all filters — this is a candidate
      candidates.push({
        ticker,
        company_name: profile.companyName,
        sector: profile.sector,
        market_cap: marketCap,
        current_price: price,
        revenue_growth_pct: Math.round(revGrowth * 10) / 10,
        pct_from_52w_high: Math.round(pctFrom52w * 10) / 10,
        prescreen_score: 0,
        last_updated: new Date().toISOString(),
      });
    } catch (err) {
      // Skip on error, never crash
    }

    await sleep(200);
  }

  console.log(`[Stage 2] Pre-screen done: ${candidates.length} candidates from ${universe.length} universe`);

  // Clear old candidates and upsert new ones
  if (candidates.length > 0) {
    // Upsert in batches
    const batchSize = 100;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const { error } = await supabase
        .from('screener_candidates')
        .upsert(batch, { onConflict: 'ticker' });
      if (error) console.error(`[Stage 2] Upsert batch error:`, error.message);
    }
  }

  // Log scan history
  await supabase.from('scan_history').insert({
    stage: 'PRESCREEN',
    tickers_processed: universe.length,
    tickers_passed: candidates.length,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Stage 2] Complete: ${universe.length} screened → ${candidates.length} candidates (${elapsed}s)`);
  return candidates.length;
}

module.exports = { runPrescreen };
