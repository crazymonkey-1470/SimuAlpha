/**
 * Historical Backtesting Engine
 *
 * Rolling-window approach: for each month in history, simulate what
 * would have been known at that date, detect wave signals, then look
 * forward to determine outcome.
 */

const { detectPivots, validateImpulseWave, validateCorrectiveWave, calculateFibTargets } = require('./elliott_wave');
const supabase = require('./supabase');
const log = require('./logger').child({ module: 'backtester' });

/**
 * Backtest a single ticker using its full monthly price history.
 * @param {string} ticker
 * @param {Array<{date:string, close:number}>} fullHistory - max available monthly closes
 * @returns {{ signals: Array, summary: object }}
 */
async function backtestTicker(ticker, fullHistory) {
  if (!fullHistory || fullHistory.length < 72) {
    // Need at least 6 years: 60 for wave detection + 12 forward
    return { signals: [], summary: null };
  }

  const signals = [];
  const minWindow = 60;
  const forwardMonths = 36; // Look up to 3 years forward for outcome
  let lastSignalIndex = -999; // Track to avoid duplicate signals within 3 months

  for (let i = minWindow; i < fullHistory.length - 12; i++) {
    // Skip if a signal was detected within last 3 months
    if (i - lastSignalIndex < 3) continue;

    // Simulate: only data known up to this date
    const knownHistory = fullHistory.slice(0, i + 1);
    const currentPrice = knownHistory[knownHistory.length - 1].close;
    const currentDate = knownHistory[knownHistory.length - 1].date;

    if (currentPrice == null) continue;

    // Detect pivots and attempt wave labeling
    const pivots = detectPivots(knownHistory, 0.15);
    if (pivots.length < 4) continue;

    // Try corrective wave fit (most valuable TLI signal)
    let buySignal = null;

    // Check last 4 pivots for corrective pattern
    if (pivots.length >= 4) {
      const lastFour = pivots.slice(-4);
      if (lastFour[0].type === 'HIGH') {
        const corrResult = validateCorrectiveWave(lastFour);
        if (corrResult.valid && corrResult.confidence >= 60) {
          const targets = calculateFibTargets('corrective', 'C', lastFour, currentPrice);
          if (targets.reward_risk_ratio != null && targets.reward_risk_ratio >= 2.0 && targets.stop_loss != null && targets.target_1 != null) {
            buySignal = {
              wave: 'C',
              confidence: corrResult.confidence,
              entryPrice: currentPrice,
              stopLoss: targets.stop_loss,
              target1: targets.target_1,
              target2: targets.target_2,
              rewardRisk: targets.reward_risk_ratio,
            };
          }
        }
      }
    }

    // Check for Wave 2 entry
    if (!buySignal && pivots.length >= 2) {
      const lastTwo = pivots.slice(-2);
      if (lastTwo[0].type === 'LOW' && lastTwo[1].type === 'HIGH') {
        // Possible Wave 1 complete, Wave 2 retracing
        const w1_len = lastTwo[1].price - lastTwo[0].price;
        if (w1_len > 0) {
          const retrace = (lastTwo[1].price - currentPrice) / w1_len;
          if (retrace >= 0.382 && retrace <= 0.786) {
            const targets = calculateFibTargets('impulse', '2', pivots.slice(-2).concat([{ price: currentPrice }]), currentPrice);
            if (targets.reward_risk_ratio != null && targets.reward_risk_ratio >= 2.0 && targets.stop_loss != null && targets.target_1 != null) {
              buySignal = {
                wave: '2',
                confidence: 65,
                entryPrice: currentPrice,
                stopLoss: targets.stop_loss,
                target1: targets.target_1,
                target2: targets.target_2,
                rewardRisk: targets.reward_risk_ratio,
              };
            }
          }
        }
      }
    }

    if (!buySignal) continue;

    lastSignalIndex = i;

    // Look forward to determine outcome
    const forwardEnd = Math.min(i + forwardMonths, fullHistory.length - 1);
    let outcome = 'OPEN';
    let exitPrice = null;
    let exitDate = null;
    let maxDrawdown = 0;
    let maxGain = 0;

    for (let j = i + 1; j <= forwardEnd; j++) {
      const fwdPrice = fullHistory[j].close;
      if (fwdPrice == null) continue;

      const pctChange = ((fwdPrice - buySignal.entryPrice) / buySignal.entryPrice) * 100;
      const drawdown = Math.min(0, pctChange);
      const gain = Math.max(0, pctChange);

      if (drawdown < maxDrawdown) maxDrawdown = drawdown;
      if (gain > maxGain) maxGain = gain;

      // Check stop loss
      if (fwdPrice <= buySignal.stopLoss) {
        outcome = 'STOPPED_OUT';
        exitPrice = buySignal.stopLoss;
        exitDate = fullHistory[j].date;
        break;
      }

      // Check target 2 first (higher priority exit)
      if (buySignal.target2 != null && fwdPrice >= buySignal.target2) {
        outcome = 'TARGET_2_HIT';
        exitPrice = buySignal.target2;
        exitDate = fullHistory[j].date;
        break;
      }

      // Check target 1
      if (fwdPrice >= buySignal.target1) {
        outcome = 'TARGET_1_HIT';
        exitPrice = buySignal.target1;
        exitDate = fullHistory[j].date;
        break;
      }
    }

    // If still open after forward window, use last known price
    if (outcome === 'OPEN') {
      exitPrice = fullHistory[forwardEnd].close;
      exitDate = fullHistory[forwardEnd].date;
    }

    const pctReturn = exitPrice != null
      ? round(((exitPrice - buySignal.entryPrice) / buySignal.entryPrice) * 100, 1)
      : null;

    const holdDays = exitDate && currentDate
      ? Math.round((new Date(exitDate) - new Date(currentDate)) / (1000 * 60 * 60 * 24))
      : null;

    signals.push({
      ticker,
      timeframe: 'monthly',
      wave_degree: 'primary',
      signal_date: currentDate,
      signal_wave: buySignal.wave,
      entry_price: round(buySignal.entryPrice),
      stop_loss: round(buySignal.stopLoss),
      target_1: round(buySignal.target1),
      target_2: round(buySignal.target2),
      outcome,
      exit_price: round(exitPrice),
      exit_date: exitDate,
      hold_days: holdDays,
      pct_return: pctReturn,
      max_drawdown_pct: round(maxDrawdown, 1),
      max_gain_pct: round(maxGain, 1),
    });
  }

  // Calculate summary
  let summary = null;
  if (signals.length >= 1) {
    const completed = signals.filter((s) => s.outcome !== 'OPEN');
    const wins = completed.filter((s) => s.outcome === 'TARGET_1_HIT' || s.outcome === 'TARGET_2_HIT');
    const returns = completed.map((s) => s.pct_return).filter((r) => r != null);
    const holds = completed.map((s) => s.hold_days).filter((h) => h != null);

    summary = {
      ticker,
      total_signals: signals.length,
      winning_signals: wins.length,
      win_rate_pct: completed.length > 0 ? round((wins.length / completed.length) * 100, 1) : null,
      avg_return_pct: returns.length > 0 ? round(returns.reduce((a, b) => a + b, 0) / returns.length, 1) : null,
      avg_hold_days: holds.length > 0 ? Math.round(holds.reduce((a, b) => a + b, 0) / holds.length) : null,
      avg_reward_risk: round(signals.reduce((a, s) => a + (s.target_1 && s.stop_loss && s.entry_price ? (s.target_1 - s.entry_price) / (s.entry_price - s.stop_loss) : 0), 0) / signals.length, 1),
      best_return_pct: returns.length > 0 ? Math.max(...returns) : null,
      worst_return_pct: returns.length > 0 ? Math.min(...returns) : null,
      total_return_pct: returns.length > 0 ? round(returns.reduce((a, b) => a + b, 0), 1) : null,
      vs_spy_pct: null, // Calculated separately if SPY data available
      last_updated: new Date().toISOString(),
    };
  }

  return { signals, summary };
}

/**
 * Run backtests for all scored tickers and store results.
 */
async function runBacktestAll(tickers, fetchMonthlyFn) {
  log.info({ tickerCount: tickers.length }, 'Running backtests');

  // Fetch SPY once for benchmark comparison
  let spyHistory = [];
  try {
    const spyData = await fetchMonthlyFn('SPY');
    spyHistory = spyData || [];
  } catch (_) { /* SPY data optional */ }

  for (const ticker of tickers) {
    try {
      const monthlyData = await fetchMonthlyFn(ticker);
      if (!monthlyData || monthlyData.length < 72) continue;

      const { signals, summary } = await backtestTicker(ticker, monthlyData);

      // Store backtest results
      if (signals.length > 0) {
        // Delete old results for this ticker, then insert new
        await supabase.from('backtest_results').delete().eq('ticker', ticker);

        const batchSize = 50;
        for (let i = 0; i < signals.length; i += batchSize) {
          const batch = signals.slice(i, i + batchSize);
          await supabase.from('backtest_results').insert(batch);
        }
      }

      // Calculate SPY comparison if data available
      if (summary && spyHistory.length > 0 && signals.length > 0) {
        const spyReturns = [];
        for (const sig of signals.filter((s) => s.outcome !== 'OPEN' && s.hold_days)) {
          const spyEntry = spyHistory.find((s) => s.date >= sig.signal_date);
          const spyExit = spyHistory.find((s) => s.date >= sig.exit_date);
          if (spyEntry && spyExit && spyEntry.close > 0) {
            spyReturns.push(((spyExit.close - spyEntry.close) / spyEntry.close) * 100);
          }
        }
        if (spyReturns.length > 0 && summary.avg_return_pct != null) {
          const avgSpyReturn = spyReturns.reduce((a, b) => a + b, 0) / spyReturns.length;
          summary.vs_spy_pct = round(summary.avg_return_pct - avgSpyReturn, 1);
        }
      }

      // Upsert summary
      if (summary) {
        await supabase.from('backtest_summary').upsert(summary, { onConflict: 'ticker' });
      }

      log.info({ ticker, signalCount: signals.length, winRate: summary?.win_rate_pct, avgReturn: summary?.avg_return_pct }, 'Backtest complete');
    } catch (err) {
      log.error({ err, ticker }, 'Backtest error');
    }

    // Respect rate limits
    await new Promise((r) => setTimeout(r, 500));
  }
}

function round(val, dec = 2) {
  if (val == null || !isFinite(val)) return null;
  return Math.round(val * Math.pow(10, dec)) / Math.pow(10, dec);
}

module.exports = { backtestTicker, runBacktestAll };
