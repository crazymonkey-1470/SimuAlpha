const supabase = require('../services/supabase');
const log = require('../services/logger').child({ module: 'stage4_wavecount' });
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
    log.error({ err, ticker }, 'Extended monthly fetch failed');
    return [];
  }
}

/**
 * Stage 4 — Wave Count + Backtesting
 * Runs only on ACCUMULATE and LOAD THE BOAT candidates from Stage 3.
 */
async function runWaveCount() {
  log.info('Starting wave count analysis');
  const startTime = Date.now();

  // Get scored tickers that qualify
  const { data: candidates, error } = await supabase
    .from('screener_results')
    .select('ticker, company_name, current_price')
    .in('signal', ['LOAD THE BOAT', 'ACCUMULATE']);

  if (error || !candidates || candidates.length === 0) {
    log.info('No ACCUMULATE/LOAD THE BOAT candidates to analyze');
    return;
  }

  log.info({ count: candidates.length }, 'Analyzing candidates');

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
        log.error({ err: e, ticker }, 'Price fetch failed');
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
          if (wcErr) log.error({ err: wcErr, ticker }, 'wave_counts upsert error');
        }

        // ── Exit Signal Detection (Part 7) ──
        const topWave = waveResults[0];
        const exitSignals = detectExitSignals(topWave, current_price);
        for (const es of exitSignals) {
          // Check if this signal was already fired recently (24h)
          const { data: recentExit } = await supabase
            .from('exit_signals')
            .select('id')
            .eq('ticker', ticker)
            .eq('signal_type', es.signal_type)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(1);

          if (!recentExit || recentExit.length === 0) {
            await supabase.from('exit_signals').insert({
              ticker,
              signal_type: es.signal_type,
              signal_reason: es.signal_reason,
              price_at_signal: current_price,
              target_price: es.target_price,
            });
            // Fire Telegram alert for exit signals
            await fireAlert({
              ticker,
              company_name,
              alert_type: es.signal_type,
              score: null,
              current_price,
              price_200wma: null,
              price_200mma: null,
              entry_note: es.signal_reason,
              previous_signal: null,
              new_signal: es.signal_type,
            });
            alertsFired++;
            log.info({ ticker, signalType: es.signal_type }, 'Exit signal fired');
          }
        }

        // Update bull_bear_line from wave data
        if (topWave.wave_count_json && topWave.wave_count_json.length >= 5) {
          const w4High = topWave.wave_count_json[3]?.price; // Wave 3 end = Wave 4 start area
          if (w4High != null) {
            await supabase.from('screener_results')
              .update({ bull_bear_line: Math.round(w4High * 100) / 100 })
              .eq('ticker', ticker);
          }
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
            log.info({ ticker }, 'Calling Claude for interpretation');
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

            log.info({ ticker, conviction: interpretation.conviction, oneLiner: interpretation.one_liner }, 'Claude interpretation complete');
            await sleep(500);
          } else {
            log.info({ ticker }, 'Skipping Claude — interpretation still fresh');
          }
        } else if (getClaudeCallCount() >= CLAUDE_DAILY_LIMIT) {
          log.info({ limit: CLAUDE_DAILY_LIMIT }, 'Claude daily limit reached, skipping remaining interpretations');
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

        const bestWave = waveResults[0];
        log.info({ ticker, counts: waveResults.length, structure: bestWave.wave_structure, wave: bestWave.current_wave, confidence: bestWave.confidence_score, signal: bestWave.tli_signal }, 'Wave analysis result');
      } else {
        log.info({ ticker }, 'No valid wave counts');
      }
    } catch (err) {
      log.error({ err, ticker }, 'Wave count error');
    }

    await sleep(400);
  }

  // Run backtests
  log.info('Running backtests');
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
  log.info({ analyzed: candidates.length, waveCounts, alertsFired, elapsedSec: elapsed }, 'Stage 4 complete');
}

/**
 * Detect exit signals based on wave position and price targets.
 */
function detectExitSignals(waveCount, currentPrice) {
  if (!waveCount || currentPrice == null) return [];
  const signals = [];

  // EXIT 1: Wave 3 target hit
  if (waveCount.target_1 != null && waveCount.current_wave === '3') {
    const pctToTarget = Math.abs((currentPrice - waveCount.target_1) / waveCount.target_1) * 100;
    if (pctToTarget <= 3) {
      signals.push({
        signal_type: 'WAVE_3_TARGET_HIT',
        signal_reason: 'Wave 3 target reached — TRIM 50% of your position here per TLI methodology. Let the remaining 50% run toward Wave 5. Wave 4 pullback coming next — that is your add point.',
        target_price: waveCount.target_1,
      });
    }
  }

  // EXIT 2: Wave 4 add zone
  if (waveCount.current_wave === '4' && waveCount.entry_zone_low != null) {
    const targetZone = waveCount.entry_zone_low;
    const pctToZone = currentPrice > 0 ? Math.abs((currentPrice - targetZone) / targetZone) * 100 : null;
    if (pctToZone != null && pctToZone <= 5) {
      signals.push({
        signal_type: 'WAVE_4_ADD_ZONE',
        signal_reason: 'Wave 4 pullback to 0.382 Fib confirmed. This is the TLI add zone — scale in 2/5 of remaining allocation here. Wave 5 toward final target is next.',
        target_price: targetZone,
      });
    }
  }

  // EXIT 3: Wave 5 target hit
  if (waveCount.current_wave === '5' && waveCount.target_1 != null) {
    const pctToTarget = Math.abs((currentPrice - waveCount.target_1) / waveCount.target_1) * 100;
    if (pctToTarget <= 3) {
      signals.push({
        signal_type: 'WAVE_5_TARGET_HIT',
        signal_reason: 'Wave 5 target approaching — begin taking profits. TLI methodology: exit 50% here. A-B-C correction begins after Wave 5 completes. Do not hold through the full correction.',
        target_price: waveCount.target_1,
      });
    }
  }

  // EXIT 4: Wave B rejection
  if (waveCount.current_wave === 'B' || waveCount.tli_signal === 'WAVE_B_BOUNCE') {
    signals.push({
      signal_type: 'WAVE_B_REJECTION',
      signal_reason: 'Wave B rejection detected — exit liquidity. Smart money exits here. Retail mistakes this for recovery. Wave C decline is coming. Trim remaining position.',
      target_price: null,
    });
  }

  return signals;
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
