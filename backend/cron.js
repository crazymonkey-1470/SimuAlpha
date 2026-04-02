const cron = require('node-cron');
const supabase = require('./supabase');
const tickers = require('./tickers');
const { getHistoricalPrices, calculate200WMA, calculate200MMA, getQuote, getFundamentals, sleep } = require('./fetcher');
const { scoreTicker } = require('./scorer');

async function scanTicker(ticker) {
  try {
    const [historicals, quote, fundamentals] = await Promise.all([
      getHistoricalPrices(ticker),
      getQuote(ticker),
      getFundamentals(ticker),
    ]);

    const price200WMA = calculate200WMA(historicals.weeklyCloses);
    const price200MMA = calculate200MMA(historicals.monthlyCloses);

    if (quote.currentPrice == null) {
      console.log(`  ${ticker}: no price data, skipping`);
      return null;
    }

    const scores = scoreTicker({
      currentPrice: quote.currentPrice,
      week52High: quote.week52High,
      price200WMA,
      price200MMA,
      revenueGrowthPct: fundamentals.revenueGrowthPct,
      psRatio: fundamentals.psRatio,
      peRatio: fundamentals.peRatio,
    });

    const row = {
      ticker,
      company_name: fundamentals.sector ? quote.companyName : quote.companyName,
      sector: fundamentals.sector || null,
      current_price: quote.currentPrice,
      price_200wma: price200WMA != null ? Math.round(price200WMA * 100) / 100 : null,
      price_200mma: price200MMA != null ? Math.round(price200MMA * 100) / 100 : null,
      pct_from_200wma: scores.pctFrom200WMA,
      pct_from_200mma: scores.pctFrom200MMA,
      revenue_current: fundamentals.revenueCurrent,
      revenue_prior_year: fundamentals.revenuePrior,
      revenue_growth_pct: fundamentals.revenueGrowthPct != null
        ? Math.round(fundamentals.revenueGrowthPct * 10) / 10
        : null,
      pe_ratio: fundamentals.peRatio != null
        ? Math.round(fundamentals.peRatio * 10) / 10
        : null,
      ps_ratio: fundamentals.psRatio != null
        ? Math.round(fundamentals.psRatio * 10) / 10
        : null,
      week_52_high: quote.week52High,
      pct_from_52w_high: scores.pctFrom52wHigh,
      fundamental_score: scores.fundamentalScore,
      technical_score: scores.technicalScore,
      total_score: scores.totalScore,
      signal: scores.signal,
      last_updated: new Date().toISOString(),
    };

    console.log(`  ${ticker}: score ${scores.totalScore} - ${scores.signal}`);
    return row;
  } catch (err) {
    console.error(`  ${ticker}: ERROR -`, err.message);
    return null;
  }
}

async function runScan() {
  console.log(`\n[TLI] Starting scan of ${tickers.length} tickers at ${new Date().toISOString()}`);

  const results = [];

  for (let i = 0; i < tickers.length; i++) {
    const result = await scanTicker(tickers[i]);
    if (result) results.push(result);

    // 300ms delay between tickers to respect rate limits
    if (i < tickers.length - 1) {
      await sleep(300);
    }
  }

  // Upsert results into Supabase
  if (results.length > 0) {
    const { error } = await supabase
      .from('screener_results')
      .upsert(results, { onConflict: 'ticker' });

    if (error) {
      console.error('[TLI] Supabase upsert error:', error.message);
    } else {
      console.log(`[TLI] Upserted ${results.length} results to Supabase`);
    }
  }

  // Record scan history
  const loadCount = results.filter((r) => r.signal === 'LOAD THE BOAT').length;
  const accumCount = results.filter((r) => r.signal === 'ACCUMULATE').length;
  const topOpps = results
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 5)
    .map((r) => ({ ticker: r.ticker, score: r.total_score, signal: r.signal }));

  const { error: histError } = await supabase.from('scan_history').insert({
    tickers_scanned: results.length,
    load_the_boat_count: loadCount,
    accumulate_count: accumCount,
    top_opportunities: topOpps,
  });

  if (histError) {
    console.error('[TLI] Scan history insert error:', histError.message);
  }

  console.log(`[TLI] Scan complete: ${results.length} tickers | ${loadCount} LOAD THE BOAT | ${accumCount} ACCUMULATE`);
}

function startCron() {
  // Run every 6 hours
  cron.schedule('0 */6 * * *', () => {
    console.log('[TLI] Cron triggered - starting scheduled scan');
    runScan().catch((err) => console.error('[TLI] Cron scan error:', err));
  });
  console.log('[TLI] Cron scheduled: every 6 hours (0 */6 * * *)');
}

module.exports = { runScan, startCron };
