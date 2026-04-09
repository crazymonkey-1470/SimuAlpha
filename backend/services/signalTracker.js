const supabase = require('./supabase');

/**
 * Signal Outcome Tracker — Sprint 6B
 * Records actionable signals and tracks their outcomes over time.
 */

const ACTIONABLE_SIGNALS = ['LOAD THE BOAT', 'ACCUMULATE', 'GENERATIONAL_BUY'];

function getCurrentScoringWeights() {
  return {
    version: 'v2',
    fundamental: {
      revenueGrowth: 20,
      growthMomentum: 5,
      fcf: 10,
      moat: 5,
      valuationVsPeers: 5,
      balanceSheet: 5,
    },
    technical: {
      pctFrom200WMA: 25,
      pctFrom200MMA: 25,
    },
    bonuses: 'institutional, dividend, SaaS quality, buybacks, cyclical recovery',
    penalties: 'value trap, GAAP divergence, institutional sell, late cycle, earnings proximity, AI capex, carry trade',
  };
}

async function recordSignal(stock, scoreResult) {
  const signalType = scoreResult.signal?.replace(/ /g, '_');
  if (!ACTIONABLE_SIGNALS.includes(scoreResult.signal) && signalType !== 'GENERATIONAL_BUY') {
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('signal_outcomes')
    .upsert({
      ticker: stock.ticker,
      signal_date: today,
      signal_type: signalType,
      score_at_signal: scoreResult.totalScore,
      price_at_signal: stock.currentPrice || stock.current_price,
      predicted_wave: stock.elliottWavePosition || null,
      scoring_version: 'v2',
      scoring_weights: getCurrentScoringWeights(),
    }, { onConflict: 'ticker,signal_date' });

  if (error) {
    console.error(`[SignalTracker] Record failed for ${stock.ticker}:`, error.message);
  }
}

async function updateOutcomes() {
  const now = new Date();
  const intervals = [
    { field: 'price_3mo', returnField: 'return_3mo', months: 3 },
    { field: 'price_6mo', returnField: 'return_6mo', months: 6 },
    { field: 'price_12mo', returnField: 'return_12mo', months: 12 },
    { field: 'price_24mo', returnField: 'return_24mo', months: 24 },
  ];

  for (const { field, returnField, months } of intervals) {
    // Find signals where this interval has passed but outcome not yet recorded
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const { data: signals, error } = await supabase
      .from('signal_outcomes')
      .select('id, ticker, price_at_signal, signal_date')
      .lte('signal_date', cutoffStr)
      .is(field, null)
      .limit(50);

    if (error || !signals?.length) continue;

    for (const sig of signals) {
      // Look up current price from screener_results
      const { data: stock } = await supabase
        .from('screener_results')
        .select('current_price')
        .eq('ticker', sig.ticker)
        .maybeSingle();

      if (!stock?.current_price || !sig.price_at_signal) continue;

      const returnPct = Math.round(
        ((stock.current_price - sig.price_at_signal) / sig.price_at_signal) * 10000
      ) / 100;

      const { error: updateErr } = await supabase
        .from('signal_outcomes')
        .update({
          [field]: stock.current_price,
          [returnField]: returnPct,
        })
        .eq('id', sig.id);

      if (updateErr) {
        console.error(`[SignalTracker] Update failed for ${sig.ticker}:`, updateErr.message);
      }
    }
  }

  console.log('[SignalTracker] Outcome update complete');
}

async function getSignalHistory(limit = 100) {
  const { data, error } = await supabase
    .from('signal_outcomes')
    .select('*')
    .order('signal_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[SignalTracker] History fetch failed:', error.message);
    return [];
  }
  return data || [];
}

async function getAccuracyStats() {
  const { data: signals } = await supabase
    .from('signal_outcomes')
    .select('*')
    .not('return_3mo', 'is', null);

  if (!signals?.length) return null;

  const ltbSignals = signals.filter(s => s.signal_type === 'LOAD_THE_BOAT');
  const accSignals = signals.filter(s => s.signal_type === 'ACCUMULATE');

  const winRate = (arr, field) => {
    const withData = arr.filter(s => s[field] != null);
    if (!withData.length) return null;
    return Math.round((withData.filter(s => s[field] > 0).length / withData.length) * 10000) / 100;
  };

  const avgReturn = (arr, field) => {
    const withData = arr.filter(s => s[field] != null);
    if (!withData.length) return null;
    return Math.round(withData.reduce((a, s) => a + s[field], 0) / withData.length * 100) / 100;
  };

  return {
    total_signals: signals.length,
    load_the_boat_win_rate: winRate(ltbSignals, 'return_3mo'),
    accumulate_win_rate: winRate(accSignals, 'return_3mo'),
    avg_return_3mo: avgReturn(signals, 'return_3mo'),
    avg_return_6mo: avgReturn(signals, 'return_6mo'),
    avg_return_12mo: avgReturn(signals, 'return_12mo'),
  };
}

module.exports = {
  recordSignal,
  updateOutcomes,
  getSignalHistory,
  getAccuracyStats,
  getCurrentScoringWeights,
};
