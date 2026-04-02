const supabase = require('../services/supabase');
const { fetchHistoricalPrices, sleep } = require('../services/fetcher');
const { runWaveAnalysis } = require('../services/elliott_wave');
const { runBacktestAll } = require('../services/backtester');
const { fireAlert } = require('../services/alerts');
const yahooFinance = require('yahoo-finance2').default;

/**
 * Fetch extended monthly price history for backtesting (max available).
 */
async function fetchExtendedMonthly(ticker) {
  try {
    const thirtyYearsAgo = new Date();
    thirtyYearsAgo.setFullYear(thirtyYearsAgo.getFullYear() - 30);

    const result = await yahooFinance.chart(ticker, {
      period1: thirtyYearsAgo.toISOString().split('T')[0],
      interval: '1mo',
    });

    return (result.quotes || [])
      .filter((q) => q.close != null)
      .map((q) => ({
        date: q.date ? new Date(q.date).toISOString().split('T')[0] : null,
        close: q.close,
      }))
      .filter((q) => q.date != null);
  } catch (err) {
    console.error(`[Stage 4] Extended monthly fetch failed for ${ticker}:`, err.message);
    return [];
  }
}

/**
 * Stage 4 — Wave Count + Backtesting
 * Runs only on ACCUMULATE and LOAD THE BOAT candidates from Stage 3.
 */
async function runWaveCount() {
  console.log('\n[Stage 4] Starting wave count analysis...');
  const startTime = Date.now();

  // Get scored tickers that qualify
  const { data: candidates, error } = await supabase
    .from('screener_results')
    .select('ticker, company_name, current_price')
    .in('signal', ['LOAD THE BOAT', 'ACCUMULATE']);

  if (error || !candidates || candidates.length === 0) {
    console.log('[Stage 4] No ACCUMULATE/LOAD THE BOAT candidates to analyze');
    return;
  }

  console.log(`[Stage 4] Analyzing ${candidates.length} candidates...`);

  let waveCounts = 0;
  let alertsFired = 0;

  for (const { ticker, company_name, current_price } of candidates) {
    try {
      // Fetch historical prices (extended for wave detection)
      const historicals = await fetchHistoricalPrices(ticker);

      // Build price arrays with dates for wave analysis
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      const twentyYearsAgo = new Date();
      twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);

      // Fetch with dates for wave engine
      let monthlyWithDates = [];
      let weeklyWithDates = [];
      try {
        const [mResult, wResult] = await Promise.all([
          yahooFinance.chart(ticker, { period1: twentyYearsAgo.toISOString().split('T')[0], interval: '1mo' }),
          yahooFinance.chart(ticker, { period1: fiveYearsAgo.toISOString().split('T')[0], interval: '1wk' }),
        ]);
        monthlyWithDates = (mResult.quotes || []).filter((q) => q.close != null).map((q) => ({
          date: q.date ? new Date(q.date).toISOString().split('T')[0] : null,
          close: q.close, high: q.high, low: q.low, open: q.open,
        })).filter((q) => q.date);
        weeklyWithDates = (wResult.quotes || []).filter((q) => q.close != null).map((q) => ({
          date: q.date ? new Date(q.date).toISOString().split('T')[0] : null,
          close: q.close, high: q.high, low: q.low, open: q.open,
        })).filter((q) => q.date);
      } catch (e) {
        console.error(`  ${ticker}: price fetch failed -`, e.message);
        await sleep(400);
        continue;
      }

      // Run wave analysis
      const waveResults = runWaveAnalysis(ticker, monthlyWithDates, weeklyWithDates, current_price);

      if (waveResults.length > 0) {
        // Upsert wave counts
        for (const wc of waveResults) {
          const { error: wcErr } = await supabase
            .from('wave_counts')
            .upsert(wc, { onConflict: 'ticker,timeframe,wave_degree' });
          if (wcErr) console.error(`  ${ticker}: wave_counts upsert error -`, wcErr.message);
        }

        waveCounts += waveResults.length;

        // Check for BUY_ZONE alerts
        const buyZone = waveResults.find((w) => w.tli_signal === 'BUY_ZONE' && w.confidence_score >= 60);
        if (buyZone) {
          // Check if alert already fired recently
          const { data: recentAlerts } = await supabase
            .from('signal_alerts')
            .select('id')
            .eq('ticker', ticker)
            .gte('fired_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .limit(1);

          if (!recentAlerts || recentAlerts.length === 0) {
            const backtestSummary = await getBacktestSummary(ticker);
            const waveNote = `Wave ${buyZone.current_wave} ${buyZone.wave_structure} — ${buyZone.confidence_label}`;
            const targetNote = buyZone.target_1 ? `Target 1: $${buyZone.target_1} | R/R: ${buyZone.reward_risk_ratio}x` : '';
            const btNote = backtestSummary ? `Backtest: ${backtestSummary.total_signals} signals, ${backtestSummary.win_rate_pct}% win rate` : '';

            await fireAlert({
              ticker,
              company_name,
              alert_type: 'LOAD_THE_BOAT',
              score: null,
              current_price,
              price_200wma: null,
              price_200mma: null,
              entry_note: [waveNote, targetNote, btNote].filter(Boolean).join('\n'),
              previous_signal: null,
              new_signal: 'WAVE BUY ZONE',
            });
            alertsFired++;
          }
        }

        const topWave = waveResults[0];
        console.log(`  ${ticker}: ${waveResults.length} counts | best: ${topWave.wave_structure} W${topWave.current_wave} (${topWave.confidence_score}%) ${topWave.tli_signal}`);
      } else {
        console.log(`  ${ticker}: no valid wave counts`);
      }
    } catch (err) {
      console.error(`  ${ticker}: ERROR -`, err.message);
    }

    await sleep(400);
  }

  // Run backtests
  console.log('\n[Stage 4] Running backtests...');
  const tickerList = candidates.map((c) => c.ticker);
  await runBacktestAll(tickerList, fetchExtendedMonthly);

  // Log scan history
  await supabase.from('scan_history').insert({
    stage: 'WAVECOUNT',
    tickers_processed: candidates.length,
    tickers_passed: waveCounts,
    alerts_fired: alertsFired,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Stage 4] Complete: ${candidates.length} analyzed | ${waveCounts} wave counts | ${alertsFired} alerts (${elapsed}s)`);
}

async function getBacktestSummary(ticker) {
  try {
    const { data } = await supabase
      .from('backtest_summary')
      .select('*')
      .eq('ticker', ticker)
      .single();
    return data;
  } catch {
    return null;
  }
}

module.exports = { runWaveCount };
