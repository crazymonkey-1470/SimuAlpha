const supabase = require('../services/supabase');
const { fetchHistoricalPrices, fetchQuote, fetchRatios, fetchIncomeStatement, calculate200WMA, calculate200MMA, sleep } = require('../services/fetcher');
const { runScorer } = require('../services/scorer');
const { fireAlert } = require('../services/alerts');

/**
 * Stage 3 — Deep Score
 * For each candidate: fetch full data, run TLI scorer, detect signal changes,
 * fire Telegram alerts, and upsert into screener_results.
 */
async function runDeepScore() {
  console.log('\n[Stage 3] Starting deep scoring of candidates...');
  const startTime = Date.now();

  const { data: candidates, error: readErr } = await supabase
    .from('screener_candidates')
    .select('ticker, company_name, sector');

  if (readErr || !candidates) {
    console.error('[Stage 3] Failed to read candidates:', readErr?.message);
    return;
  }

  console.log(`[Stage 3] Scoring ${candidates.length} candidates...`);

  const results = [];
  let alertsFired = 0;

  for (let i = 0; i < candidates.length; i++) {
    const { ticker, company_name, sector } = candidates[i];

    try {
      // Fetch all data in parallel
      const [historicals, quote, ratios, income] = await Promise.all([
        fetchHistoricalPrices(ticker),
        fetchQuote(ticker),
        fetchRatios(ticker),
        fetchIncomeStatement(ticker),
      ]);

      const price200WMA = calculate200WMA(historicals.weeklyCloses);
      const price200MMA = calculate200MMA(historicals.monthlyCloses);
      const currentPrice = quote.currentPrice;

      if (currentPrice == null) {
        console.log(`  ${ticker}: no price, skipping`);
        await sleep(300);
        continue;
      }

      // Run TLI scorer
      const scores = runScorer({
        currentPrice,
        week52High: quote.week52High,
        price200WMA,
        price200MMA,
        revenueGrowthPct: income.revenueGrowthPct,
        psRatio: ratios.psRatio,
        peRatio: ratios.peRatio,
      });

      // Skip PASS signals
      if (scores.signal === 'PASS') {
        await sleep(300);
        continue;
      }

      // Get previous score/signal for comparison
      const { data: prev } = await supabase
        .from('screener_results')
        .select('total_score, signal, current_price, price_200wma, price_200mma')
        .eq('ticker', ticker)
        .single();

      const previousScore = prev?.total_score ?? null;
      const previousSignal = prev?.signal ?? null;
      const prevPrice = prev?.current_price ?? null;

      // Build result row
      const row = {
        ticker,
        company_name: company_name || quote.companyName,
        sector: sector || null,
        current_price: currentPrice,
        price_200wma: price200WMA != null ? Math.round(price200WMA * 100) / 100 : null,
        price_200mma: price200MMA != null ? Math.round(price200MMA * 100) / 100 : null,
        pct_from_200wma: scores.pctFrom200WMA,
        pct_from_200mma: scores.pctFrom200MMA,
        revenue_current: income.revenueCurrent,
        revenue_prior_year: income.revenuePrior,
        revenue_growth_pct: income.revenueGrowthPct != null ? Math.round(income.revenueGrowthPct * 10) / 10 : null,
        pe_ratio: ratios.peRatio != null ? Math.round(ratios.peRatio * 10) / 10 : null,
        ps_ratio: ratios.psRatio != null ? Math.round(ratios.psRatio * 10) / 10 : null,
        week_52_high: quote.week52High,
        pct_from_52w_high: scores.pctFrom52wHigh,
        fundamental_score: scores.fundamentalScore,
        technical_score: scores.technicalScore,
        total_score: scores.totalScore,
        previous_score: previousScore,
        signal: scores.signal,
        previous_signal: previousSignal,
        entry_zone: scores.entryZone,
        entry_note: scores.entryNote,
        last_updated: new Date().toISOString(),
      };

      results.push(row);

      // Detect alerts
      const alerts = detectAlerts({
        ticker,
        companyName: row.company_name,
        sector: row.sector,
        currentPrice,
        price200WMA,
        price200MMA,
        score: scores.totalScore,
        signal: scores.signal,
        previousSignal,
        entryNote: scores.entryNote,
        prevPrice,
        prevWMA: prev?.price_200wma,
        prevMMA: prev?.price_200mma,
      });

      for (const alert of alerts) {
        await fireAlert(alert);
        await supabase.from('signal_alerts').insert(alert);
        alertsFired++;
      }

      console.log(`  ${ticker}: ${scores.totalScore} - ${scores.signal}${scores.entryZone ? ' [ENTRY ZONE]' : ''}${alerts.length > 0 ? ` (${alerts.length} alerts)` : ''}`);
    } catch (err) {
      console.error(`  ${ticker}: ERROR -`, err.message);
    }

    await sleep(300);
  }

  // Upsert all results
  if (results.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);
      const { error } = await supabase
        .from('screener_results')
        .upsert(batch, { onConflict: 'ticker' });
      if (error) console.error('[Stage 3] Upsert error:', error.message);
    }
  }

  // Scan summary
  const loadCount = results.filter((r) => r.signal === 'LOAD THE BOAT').length;
  const accumCount = results.filter((r) => r.signal === 'ACCUMULATE').length;
  const topOpps = results
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 10)
    .map((r) => ({ ticker: r.ticker, score: r.total_score, signal: r.signal, entry_zone: r.entry_zone }));

  await supabase.from('scan_history').insert({
    stage: 'DEEPSCORE',
    tickers_processed: candidates.length,
    tickers_passed: results.length,
    load_the_boat_count: loadCount,
    accumulate_count: accumCount,
    alerts_fired: alertsFired,
    top_opportunities: topOpps,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Stage 3] Complete: ${results.length} scored | ${loadCount} LOAD THE BOAT | ${accumCount} ACCUMULATE | ${alertsFired} alerts (${elapsed}s)`);
}

/**
 * Detect which alerts to fire for a ticker based on signal changes.
 */
function detectAlerts({ ticker, companyName, sector, currentPrice, price200WMA, price200MMA, score, signal, previousSignal, entryNote, prevPrice, prevWMA, prevMMA }) {
  const alerts = [];
  const base = {
    ticker,
    company_name: companyName,
    score,
    current_price: currentPrice,
    price_200wma: price200WMA,
    price_200mma: price200MMA,
    entry_note: entryNote,
  };

  // New LOAD THE BOAT signal
  if (signal === 'LOAD THE BOAT' && previousSignal !== 'LOAD THE BOAT') {
    alerts.push({
      ...base,
      alert_type: 'LOAD_THE_BOAT',
      previous_signal: previousSignal,
      new_signal: signal,
    });
  }
  // Signal upgrade (WATCH → ACCUMULATE, etc.)
  else if (previousSignal && previousSignal !== signal) {
    const rank = { PASS: 0, WATCH: 1, ACCUMULATE: 2, 'LOAD THE BOAT': 3 };
    if ((rank[signal] || 0) > (rank[previousSignal] || 0)) {
      alerts.push({
        ...base,
        alert_type: 'SIGNAL_UPGRADE',
        previous_signal: previousSignal,
        new_signal: signal,
      });
    }
  }

  // Price crossed below 200WMA
  if (price200WMA != null && currentPrice < price200WMA && prevPrice != null && prevPrice >= price200WMA) {
    alerts.push({
      ...base,
      alert_type: 'CROSSED_200WMA',
      previous_signal: previousSignal,
      new_signal: signal,
    });
  }

  // Price crossed below 200MMA
  if (price200MMA != null && currentPrice < price200MMA && prevPrice != null && prevPrice >= price200MMA) {
    alerts.push({
      ...base,
      alert_type: 'CROSSED_200MMA',
      previous_signal: previousSignal,
      new_signal: signal,
    });
  }

  return alerts;
}

module.exports = { runDeepScore };
