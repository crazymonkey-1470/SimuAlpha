const supabase = require('../services/supabase');
const { fetchStockList } = require('../services/fetcher');

/**
 * Stage 1 — Universe
 * Fetches all NYSE + NASDAQ stocks from FMP, filters to investable universe,
 * and upserts into the `universe` table.
 */
async function fetchUniverse() {
  console.log('\n[Stage 1] Fetching full stock universe from FMP...');
  const startTime = Date.now();

  const allStocks = await fetchStockList();
  console.log(`[Stage 1] Received ${allStocks.length} total listings`);

  // Filter to investable universe
  const validExchanges = ['NYSE', 'NASDAQ'];
  const survivors = allStocks.filter((s) => {
    if (!s.symbol || !s.name) return false;
    if (!validExchanges.includes(s.exchangeShortName)) return false;
    if (s.type === 'etf' || s.type === 'fund') return false;
    if (s.price != null && s.price < 2) return false;
    // Skip tickers with special characters (warrants, units, etc.)
    if (/[.\-]/.test(s.symbol)) return false;
    return true;
  });

  console.log(`[Stage 1] Filtered to ${survivors.length} investable stocks`);

  // Upsert in batches of 500
  const batchSize = 500;
  for (let i = 0; i < survivors.length; i += batchSize) {
    const batch = survivors.slice(i, i + batchSize).map((s) => ({
      ticker: s.symbol,
      company_name: s.name,
      exchange: s.exchangeShortName,
      sector: null,
      industry: null,
      market_cap: null,
      last_updated: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('universe')
      .upsert(batch, { onConflict: 'ticker' });

    if (error) console.error(`[Stage 1] Upsert batch error:`, error.message);
  }

  // Log scan history
  await supabase.from('scan_history').insert({
    stage: 'UNIVERSE',
    tickers_processed: allStocks.length,
    tickers_passed: survivors.length,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Stage 1] Complete: ${allStocks.length} fetched → ${survivors.length} stored (${elapsed}s)`);
  return survivors.length;
}

module.exports = { fetchUniverse };
