const supabase = require('../services/supabase');
const { sleep } = require('../services/fetcher');
const log = require('../services/logger').child({ module: 'stage2_prescreen' });

const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8000';

/**
 * Stage 2 — Pre-screen
 * Reads universe, applies lightweight filters via scraper data,
 * stores survivors (~200-400) in `screener_candidates`.
 */

// Prevent concurrent runs
let isRunning = false;

async function runPrescreen() {
  if (isRunning) {
    log.info('Already running, skipping duplicate trigger');
    return 0;
  }
  isRunning = true;

  try {
    return await _runPrescreen();
  } finally {
    isRunning = false;
  }
}

async function _runPrescreen() {
  log.info('Starting pre-screen of universe');
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
      log.error({ err: error }, 'Failed to read universe');
      return 0;
    }
    if (!data || data.length === 0) break;
    universe = universe.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (universe.length === 0) {
    log.error('Universe is empty');
    return 0;
  }

  log.info({ count: universe.length }, 'Processing universe tickers');

  const candidates = [];
  let processed = 0;
  let consecutiveErrors = 0;

  // Diagnostic counters
  const filterStats = {
    fetchFailed: 0,
    noMarketCap: 0,
    lowMarketCap: 0,
    noPrice: 0,
    noRevenue: 0,
    noValueSignal: 0,
    passed: 0,
  };

  for (const { ticker } of universe) {
    processed++;
    if (processed % 100 === 0) {
      log.info({ processed, total: universe.length, candidates: candidates.length, filterStats }, 'Progress update');
    }

    try {
      // Single API call — profile and income come from the same scraper endpoint
      const res = await fetch(`${SCRAPER_URL}/fundamentals/${ticker}`);
      await sleep(100);

      if (!res.ok) {
        consecutiveErrors++;
        if (consecutiveErrors >= 20) {
          log.error({ consecutiveErrors }, 'Too many consecutive errors — scraper may be down, stopping');
          break;
        }
        filterStats.fetchFailed++;
        continue;
      }
      consecutiveErrors = 0;

      const data = await res.json();

      // Log first 5 tickers for diagnostics
      if (processed <= 5) {
        log.info({ ticker, price: data.current_price, mcap: data.market_cap, rev: data.revenue_current, source: data.source }, 'Sample ticker data');
      }

      const marketCap = data.market_cap ?? null;
      const price = data.current_price ?? null;
      const week52High = data.week_52_high ?? null;
      const revGrowth = data.revenue_growth_pct ?? null;
      const revCurrent = data.revenue_current ?? null;

      // Hard filters — must pass all
      if (marketCap == null) { filterStats.noMarketCap++; continue; }
      if (marketCap < 500e6) { filterStats.lowMarketCap++; continue; }
      if (price == null || price <= 3) { filterStats.noPrice++; continue; }
      if (revCurrent == null || revCurrent <= 0) { filterStats.noRevenue++; continue; }

      // Soft filter: positive revenue growth preferred but not required
      const hasGrowth = revGrowth != null && revGrowth > 0;

      // 52-week high drawdown
      let pctFrom52w = null;
      if (price != null && week52High != null && week52High > 0) {
        pctFrom52w = ((price - week52High) / week52High) * 100;
      }
      const hasDrawdown = pctFrom52w != null && pctFrom52w <= -15;

      // Must have at least one value signal: growth OR drawdown OR both
      if (!hasGrowth && !hasDrawdown) { filterStats.noValueSignal++; continue; }

      filterStats.passed++;

      candidates.push({
        ticker,
        company_name: data.company_name || ticker,
        sector: data.sector || null,
        market_cap: marketCap,
        current_price: price,
        revenue_growth_pct: revGrowth != null ? Math.round(revGrowth * 10) / 10 : null,
        pct_from_52w_high: pctFrom52w != null ? Math.round(pctFrom52w * 10) / 10 : null,
        prescreen_score: 0,
        last_updated: new Date().toISOString(),
      });
    } catch (err) {
      consecutiveErrors++;
      filterStats.fetchFailed++;
    }
  }

  log.info({ candidates: candidates.length, processed }, 'Pre-screen done');
  log.info({ filterStats }, 'Final filter stats');

  // Upsert candidates
  if (candidates.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const { error } = await supabase
        .from('screener_candidates')
        .upsert(batch, { onConflict: 'ticker' });
      if (error) log.error({ err: error }, 'Upsert batch error');
    }
  }

  // Log scan history
  await supabase.from('scan_history').insert({
    stage: 'PRESCREEN',
    tickers_processed: processed,
    tickers_passed: candidates.length,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log.info({ processed, candidates: candidates.length, elapsedSec: elapsed }, 'Stage 2 complete');
  return candidates.length;
}

module.exports = { runPrescreen };
