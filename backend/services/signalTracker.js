const supabase = require('./supabase');

/**
 * Signal Outcome Tracker — Sprint 6B
 * Records actionable signals and tracks their outcomes over time.
 */

// Sprint 10C — expanded set of actionable signals for recording
const ACTIONABLE_SIGNALS = [
  'LOAD THE BOAT', 'ACCUMULATE', 'WATCHLIST', 'WATCH',
  'GENERATIONAL_BUY', 'CONFLUENCE_ZONE', 'FULL_STACK_CONSENSUS',
];

function getCurrentScoringWeights() {
  // Legacy fallback when v3 breakdown is not available
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

function isActionableSignal(signal) {
  if (!signal) return false;
  const upper = String(signal).toUpperCase();
  if (ACTIONABLE_SIGNALS.includes(signal)) return true;
  if (ACTIONABLE_SIGNALS.includes(upper)) return true;
  // Match variants like LOAD_THE_BOAT vs LOAD THE BOAT
  return ACTIONABLE_SIGNALS.some(s => s.replace(/[_ ]/g, '') === upper.replace(/[_ ]/g, ''));
}

/**
 * Record an actionable signal with full v3 scoring breakdown.
 *
 * Sprint 10C: accepts an optional positionCard (full Position Action Card JSONB)
 * and stores the detailed v3 score components for future replay and learning.
 */
async function recordSignal(stock, scoreResult, positionCard = null) {
  if (!isActionableSignal(scoreResult?.signal)) return;

  const signalType = String(scoreResult.signal).replace(/ /g, '_');
  const today = new Date().toISOString().split('T')[0];

  // Build the v3 scoring_weights snapshot for replay
  const scoringVersion = scoreResult.version || (scoreResult.fundamentalScore != null ? 'v3' : 'v2');
  const scoringWeights = scoringVersion === 'v3'
    ? {
        version: 'v3',
        fundamental_score: scoreResult.fundamentalScore,
        wave_score: scoreResult.waveScore,
        confluence_score: scoreResult.confluenceScore,
        sain_bonus: scoreResult.sainBonus,
        lynch_score: scoreResult.lynchScreen?.score,
        buffett_score: scoreResult.buffettScreen?.score,
        dual_screen_pass: scoreResult.dualScreenPass || false,
        health_red_flags: scoreResult.healthCheck?.redFlagCount,
        downtrend_score: scoreResult.downtrendFilter?.score,
        badges: scoreResult.badges || [],
        flags: scoreResult.flags || [],
      }
    : getCurrentScoringWeights();

  const row = {
    ticker: stock.ticker,
    signal_date: today,
    signal_type: signalType,
    score_at_signal: scoreResult.totalScore ?? null,
    price_at_signal: stock.currentPrice || stock.current_price,
    predicted_wave: stock.elliottWavePosition || null,
    scoring_version: scoringVersion,
    scoring_weights: scoringWeights,
  };

  // Sprint 10C: extended columns for v3 breakdown + position_card
  if (scoringVersion === 'v3') {
    row.v3_fundamental_score = scoreResult.fundamentalScore ?? null;
    row.v3_wave_score = scoreResult.waveScore ?? null;
    row.v3_confluence_score = scoreResult.confluenceScore ?? null;
    row.v3_sain_bonus = scoreResult.sainBonus ?? null;
    row.v3_lynch_score = scoreResult.lynchScreen?.score ?? null;
    row.v3_buffett_score = scoreResult.buffettScreen?.score ?? null;
    row.v3_health_red_flags = scoreResult.healthCheck?.redFlagCount ?? null;
    row.v3_downtrend_score = scoreResult.downtrendFilter?.score ?? null;
    row.v3_badges = scoreResult.badges || [];
  }

  if (positionCard) {
    row.position_card = positionCard;
  }

  const { error } = await supabase
    .from('signal_outcomes')
    .upsert(row, { onConflict: 'ticker,signal_date' });

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
