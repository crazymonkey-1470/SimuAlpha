const supabase = require('../services/supabase');
const { sleep } = require('../services/fetcher');
const { runWaveAnalysis } = require('../services/elliott_wave');
const { runBacktestAll } = require('../services/backtester');
const { fireAlert } = require('../services/alerts');
const { interpretWaveCount, generateAlertNarrative, shouldInterpret } = require('../services/claude_interpreter');

const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8000';

// Hard cap on daily Claude calls to control cost
let claudeCallsToday = 0;
let claudeCallsDate = new Date().toDateString();
const CLAUDE_DAILY_LIMIT = 100;

function getClaudeCallCount() {
  const today = new Date().toDateString();
  if (today !== claudeCallsDate) {
    claudeCallsToday = 0;
    claudeCallsDate = today;
  }
  return claudeCallsToday;
}

/**
 * Fetch extended monthly price history for backtesting (max available).
 */
async function fetchExtendedMonthly(ticker) {
  try {
    const res = await fetch(`${SCRAPER_URL}/historical/${ticker}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.monthly || []).filter((q) => q.date && q.close != null);
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
      // Fetch historical prices with dates for wave analysis (single call)
      let monthlyWithDates = [];
      let weeklyWithDates = [];
      try {
        const res = await fetch(`${SCRAPER_URL}/historical/${ticker}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const histData = await res.json();
        monthlyWithDates = (histData.monthly || []).filter((q) => q.date && q.close != null);
        weeklyWithDates = (histData.weekly || []).filter((q) => q.date && q.close != null);
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

        // Fetch fundamentals for Claude interpretation
        const { data: fundamentals } = await supabase
          .from('screener_results')
          .select('*')
          .eq('ticker', ticker)
          .maybeSingle();

        // Claude interpretation for the best wave count
        const topWaveForClaude = waveResults[0];
        if (topWaveForClaude && getClaudeCallCount() < CLAUDE_DAILY_LIMIT && process.env.ANTHROPIC_API_KEY) {
          const { data: prevWave } = await supabase
            .from('wave_counts')
            .select('tli_signal, current_wave, confidence_label, claude_interpreted_at')
            .eq('ticker', ticker)
            .eq('timeframe', topWaveForClaude.timeframe)
            .maybeSingle();

          if (shouldInterpret(topWaveForClaude, prevWave)) {
            console.log(`  Calling Claude for ${ticker}...`);
            claudeCallsToday++;

            const backtestData = await getBacktestSummary(ticker);
            const fundData = fundamentals || {
              company_name, current_price, sector: null,
              total_score: 0, signal: 'N/A',
              price_200wma: null, price_200mma: null,
              pct_from_200wma: null, pct_from_200mma: null,
              revenue_current: null, revenue_prior_year: null,
              revenue_growth_pct: null, pe_ratio: null, ps_ratio: null,
              week_52_high: null, pct_from_52w_high: null,
            };
            const interpretation = await interpretWaveCount(
              ticker,
              topWaveForClaude,
              fundData,
              backtestData
            );

            await supabase
              .from('wave_counts')
              .update({
                claude_interpretation: interpretation,
                claude_model: interpretation.model_used,
                claude_interpreted_at: interpretation.interpreted_at,
              })
              .eq('ticker', ticker)
              .eq('timeframe', topWaveForClaude.timeframe)
              .eq('wave_degree', topWaveForClaude.wave_degree);

            console.log(`  Claude: ${ticker} — ${interpretation.conviction} conviction | "${interpretation.one_liner}"`);
            await sleep(500);
          } else {
            console.log(`  Skipping Claude for ${ticker} — interpretation still fresh`);
          }
        } else if (getClaudeCallCount() >= CLAUDE_DAILY_LIMIT) {
          console.log(`  Claude daily limit reached (${CLAUDE_DAILY_LIMIT}). Skipping remaining interpretations.`);
        }

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

            // Generate Claude narrative for the alert if available
            let narrative = null;
            let conviction = null;
            if (process.env.ANTHROPIC_API_KEY && getClaudeCallCount() < CLAUDE_DAILY_LIMIT) {
              claudeCallsToday++;
              const alertFundData = fundamentals || {
                company_name, current_price, sector: null,
                total_score: 0, signal: 'N/A',
                revenue_growth_pct: null, pct_from_200wma: null, pct_from_200mma: null,
              };
              narrative = await generateAlertNarrative(
                ticker,
                buyZone,
                alertFundData,
                'WAVE_BUY_ZONE'
              );
              // Get conviction from existing interpretation
              const { data: interp } = await supabase
                .from('wave_counts')
                .select('claude_interpretation')
                .eq('ticker', ticker)
                .eq('timeframe', buyZone.timeframe)
                .maybeSingle();
              conviction = interp?.claude_interpretation?.conviction || null;
            }

            const entryNote = [waveNote, targetNote, btNote].filter(Boolean).join('\n')
              + (narrative ? `\n\n${narrative}` : '');

            await fireAlert({
              ticker,
              company_name,
              alert_type: 'LOAD_THE_BOAT',
              score: null,
              current_price,
              price_200wma: null,
              price_200mma: null,
              entry_note: entryNote,
              previous_signal: null,
              new_signal: 'WAVE BUY ZONE',
            });

            // Update the most recent alert with claude fields
            if (narrative) {
              const { data: latestAlert } = await supabase
                .from('signal_alerts')
                .select('id')
                .eq('ticker', ticker)
                .order('fired_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              if (latestAlert) {
                await supabase
                  .from('signal_alerts')
                  .update({ claude_narrative: narrative, claude_conviction: conviction })
                  .eq('id', latestAlert.id);
              }
            }

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
  const { data } = await supabase
    .from('backtest_summary')
    .select('*')
    .eq('ticker', ticker)
    .maybeSingle();
  return data;
}

module.exports = { runWaveCount };
