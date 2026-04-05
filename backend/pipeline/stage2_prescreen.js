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

  // Read all universe tickers (Supabase defaults to 1000 rows, so paginate)
  let universe = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('universe')
      .select('ticker')
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('[Stage 2] Failed to read universe:', error.message);
      return 0;
    }
    if (!data || data.length === 0) break;
    universe = universe.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (universe.length === 0) {
    console.error('[Stage 2] Universe is empty');
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

      // Rate limit after API calls (whether we use the data or not)
      await sleep(200);

      if (!profile) { continue; }

      // Pre-screen filters
      const marketCap = profile.marketCap;
      const price = profile.currentPrice;
      const week52High = profile.week52High;
      const revGrowth = income.revenueGrowthPct;
      const revCurrent = income.revenueCurrent;

      // Hard filters — must pass all
      if (marketCap == null || marketCap < 500e6) { continue; }
      if (price == null || price <= 3) { continue; }
      if (revCurrent == null || revCurrent <= 0) { continue; }

      // Soft filter: positive revenue growth preferred but not required
      // (declining revenue stocks can still be TLI candidates if beaten down)
      const hasGrowth = revGrowth != null && revGrowth > 0;

      // 52-week high drawdown — if data available, prefer ≥15% off highs
      // If no 52w data from FMP, still allow through (Stage 3 will score properly)
      let pctFrom52w = null;
      if (week52High != null && week52High > 0) {
        pctFrom52w = ((price - week52High) / week52High) * 100;
      }
      const hasDrawdown = pctFrom52w != null && pctFrom52w <= -15;

      // Must have at least one value signal: growth OR drawdown OR both
      // This catches: beaten-down growers, deep value plays, and turnarounds
      if (!hasGrowth && !hasDrawdown) { continue; }

      // Passed all filters — this is a candidate
      candidates.push({
        ticker,
        company_name: profile.companyName,
        sector: profile.sector,
        market_cap: marketCap,
        current_price: price,
        revenue_growth_pct: revGrowth != null ? Math.round(revGrowth * 10) / 10 : null,
        pct_from_52w_high: pctFrom52w != null ? Math.round(pctFrom52w * 10) / 10 : null,
        prescreen_score: 0,
        last_updated: new Date().toISOString(),
      });
    } catch (err) {
      // Skip on error, never crash — but log it
      console.error(`  ${ticker}: prescreen error -`, err.message);
    }
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
