'use strict';

/**
 * intelligence_analyzer.js
 * Core logic for all 9 intelligence endpoints
 * Queries Supabase + aggregates data for ALPHA
 */

const supabase = require('./supabase');
const log = require('./logger').child({ module: 'intelligence_analyzer' });

// ────────────────────────────────────────────────────
// 1. CURRENT MARKET STATE
// ────────────────────────────────────────────────────

async function getCurrentMarketState() {
  try {
    // Get latest macro data
    const { data: macro } = await supabase
      .from('macro_context')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);

    // Get SPY position
    const { data: spyWave } = await supabase
      .from('wave_counts')
      .select('ticker, wave_position, fib_level, confidence')
      .eq('ticker', 'SPY')
      .order('created_at', { ascending: false })
      .limit(1);

    // Get sector strength
    const { data: sectors } = await supabase
      .from('sector_strength')
      .select('sector, momentum, pct_above_200ma')
      .order('momentum', { ascending: false })
      .limit(5);

    return {
      timestamp: new Date().toISOString(),
      vix: macro?.[0]?.vix_level || null,
      regime: macro?.[0]?.market_regime || 'unknown',
      breadth_pct: macro?.[0]?.breadth_pct || null,
      spy_price: macro?.[0]?.spy_price || null,
      spy_wave_position: spyWave?.[0]?.wave_position || '?',
      spy_fib_level: spyWave?.[0]?.fib_level || null,
      leading_sectors: sectors?.map(s => ({ sector: s.sector, momentum: s.momentum })) || [],
      vix_status: (macro?.[0]?.vix_level || 0) < 20 ? 'low' : 'elevated'
    };
  } catch (err) {
    log.error({ err }, 'Failed to get market state');
    throw err;
  }
}

// ────────────────────────────────────────────────────
// 2. TOP SIGNALS TODAY
// ────────────────────────────────────────────────────

async function getTopSignalsToday() {
  try {
    const { data: signals } = await supabase
      .from('screener_results')
      .select('ticker, tli_score, signal_tier, entry_price, fib_target, confluence_score, institutional_overlap')
      .order('tli_score', { ascending: false })
      .limit(10);

    return signals?.map(s => ({
      ticker: s.ticker,
      score: s.tli_score,
      tier: s.signal_tier,
      entry_price: s.entry_price,
      fib_target: s.fib_target,
      confluence_strength: s.confluence_score,
      institutional_funds: s.institutional_overlap || 0
    })) || [];
  } catch (err) {
    log.error({ err }, 'Failed to get top signals');
    throw err;
  }
}

// ────────────────────────────────────────────────────
// 3. SIGNAL OUTCOMES
// ────────────────────────────────────────────────────

async function getSignalOutcomes() {
  try {
    const { data: outcomes } = await supabase
      .from('signal_outcomes')
      .select('*')
      .order('signal_date', { ascending: false })
      .limit(100);

    const totalSignals = outcomes?.length || 0;
    const wonSignals = outcomes?.filter(o => o.status === 'won').length || 0;
    const lostSignals = outcomes?.filter(o => o.status === 'lost').length || 0;

    // Win rate by tier
    const byTier = {};
    outcomes?.forEach(o => {
      if (!byTier[o.tier]) {
        byTier[o.tier] = { total: 0, won: 0, avg_return: 0 };
      }
      byTier[o.tier].total += 1;
      if (o.status === 'won') byTier[o.tier].won += 1;
      byTier[o.tier].avg_return += (o.return_pct || 0);
    });

    Object.keys(byTier).forEach(tier => {
      byTier[tier].win_rate = (byTier[tier].won / byTier[tier].total * 100).toFixed(1);
      byTier[tier].avg_return = (byTier[tier].avg_return / byTier[tier].total).toFixed(2);
    });

    // Win rate by timeframe
    const timeframes = { '30d': 0, '60d': 0, '90d': 0, '180d': 0, '365d': 0 };
    const timeframeWins = { '30d': 0, '60d': 0, '90d': 0, '180d': 0, '365d': 0 };

    outcomes?.forEach(o => {
      const days = o.days_held || 0;
      if (days <= 30) { timeframes['30d']++; if (o.status === 'won') timeframeWins['30d']++; }
      if (days <= 60) { timeframes['60d']++; if (o.status === 'won') timeframeWins['60d']++; }
      if (days <= 90) { timeframes['90d']++; if (o.status === 'won') timeframeWins['90d']++; }
      if (days <= 180) { timeframes['180d']++; if (o.status === 'won') timeframeWins['180d']++; }
      if (days <= 365) { timeframes['365d']++; if (o.status === 'won') timeframeWins['365d']++; }
    });

    return {
      total_signals: totalSignals,
      win_count: wonSignals,
      loss_count: lostSignals,
      overall_win_rate: totalSignals > 0 ? ((wonSignals / totalSignals) * 100).toFixed(1) : '0.0',
      by_tier: byTier,
      by_timeframe: Object.keys(timeframes).reduce((acc, tf) => {
        acc[tf] = timeframes[tf] > 0 ? ((timeframeWins[tf] / timeframes[tf]) * 100).toFixed(1) : 0;
        return acc;
      }, {}),
      recent_outcomes: outcomes?.slice(0, 20) || []
    };
  } catch (err) {
    log.error({ err }, 'Failed to get outcomes');
    throw err;
  }
}

// ────────────────────────────────────────────────────
// 4. FACTOR ACCURACY
// ────────────────────────────────────────────────────

async function getFactorAccuracy() {
  try {
    const { data: factors } = await supabase
      .from('learned_principles')
      .select('factor_name, weight, accuracy, sample_size, updated_at')
      .order('accuracy', { ascending: false });

    return factors?.map(f => ({
      factor: f.factor_name,
      weight: (f.weight || 0).toFixed(3),
      accuracy_pct: ((f.accuracy || 0) * 100).toFixed(1),
      sample_size: f.sample_size,
      last_adjusted: f.updated_at?.split('T')[0],
      impact: f.weight > 0.7 ? 'high' : f.weight > 0.5 ? 'medium' : 'low'
    })) || [];
  } catch (err) {
    log.error({ err }, 'Failed to get factor accuracy');
    throw err;
  }
}

// ────────────────────────────────────────────────────
// 5. WAVE PATTERN STATS
// ────────────────────────────────────────────────────

async function getWavePatternStats() {
  try {
    const { data: waveData } = await supabase
      .from('wave_counts')
      .select('wave_position, ticker')
      .not('wave_position', 'is', null);

    const waveDistribution = {};
    waveData?.forEach(w => {
      waveDistribution[w.wave_position] = (waveDistribution[w.wave_position] || 0) + 1;
    });

    // Get outcomes by entry wave
    const { data: outcomes } = await supabase
      .from('signal_outcomes')
      .select('entry_wave, status, return_pct, days_held');

    const waveStats = {};
    outcomes?.forEach(o => {
      const wave = o.entry_wave || '?';
      if (!waveStats[wave]) {
        waveStats[wave] = { total: 0, won: 0, avg_return: 0, avg_days: 0 };
      }
      waveStats[wave].total += 1;
      if (o.status === 'won') waveStats[wave].won += 1;
      waveStats[wave].avg_return += (o.return_pct || 0);
      waveStats[wave].avg_days += (o.days_held || 0);
    });

    Object.keys(waveStats).forEach(wave => {
      const stats = waveStats[wave];
      stats.win_rate = ((stats.won / stats.total) * 100).toFixed(1);
      stats.avg_return = (stats.avg_return / stats.total).toFixed(2);
      stats.avg_days = Math.round(stats.avg_days / stats.total);
    });

    return {
      current_distribution: waveDistribution,
      effectiveness: waveStats
    };
  } catch (err) {
    log.error({ err }, 'Failed to get wave stats');
    throw err;
  }
}

// ────────────────────────────────────────────────────
// 6. INSTITUTIONAL SNAPSHOT
// ────────────────────────────────────────────────────

async function getInstitutionalSnapshot() {
  try {
    const { data: holdings } = await supabase
      .from('investor_holdings')
      .select('investor_name, ticker, shares, value')
      .order('value', { ascending: false })
      .limit(50);

    // Group by investor
    const byInvestor = {};
    holdings?.forEach(h => {
      if (!byInvestor[h.investor_name]) {
        byInvestor[h.investor_name] = [];
      }
      byInvestor[h.investor_name].push({
        ticker: h.ticker,
        shares: h.shares,
        value: h.value
      });
    });

    // Find consensus (stocks held by 3+ investors)
    const tickerCount = {};
    holdings?.forEach(h => {
      tickerCount[h.ticker] = (tickerCount[h.ticker] || 0) + 1;
    });

    const consensus = Object.keys(tickerCount)
      .filter(ticker => tickerCount[ticker] >= 3)
      .slice(0, 10);

    return {
      tracked_investors: Object.keys(byInvestor).length,
      top_positions: Object.keys(byInvestor).slice(0, 8).reduce((acc, inv) => {
        acc[inv] = byInvestor[inv].slice(0, 3);
        return acc;
      }, {}),
      consensus_stocks: consensus
    };
  } catch (err) {
    log.error({ err }, 'Failed to get institutional snapshot');
    throw err;
  }
}

// ────────────────────────────────────────────────────
// 7. FUNDAMENTAL QUALIFIERS
// ────────────────────────────────────────────────────

async function getFundamentalQualifiers() {
  try {
    // Start with 8,500 universe
    const { count: totalUniverse } = await supabase
      .from('screener_results')
      .select('*', { count: 'exact', head: true });

    // Filter by earnings growth >15%
    const { count: earningsPass } = await supabase
      .from('screener_results')
      .select('*', { count: 'exact', head: true })
      .gt('earnings_growth_pct', 15);

    // Filter by debt/equity <35%
    const { count: debtPass } = await supabase
      .from('screener_results')
      .select('*', { count: 'exact', head: true })
      .lt('debt_to_equity', 0.35);

    // Filter by P/E <25
    const { count: pePass } = await supabase
      .from('screener_results')
      .select('*', { count: 'exact', head: true })
      .lt('pe_ratio', 25);

    // All gates
    const { data: allPass } = await supabase
      .from('screener_results')
      .select('ticker')
      .gt('earnings_growth_pct', 15)
      .lt('debt_to_equity', 0.35)
      .lt('pe_ratio', 25)
      .limit(100);

    return {
      universe: totalUniverse,
      pass_earnings_gate: earningsPass,
      pass_debt_gate: debtPass,
      pass_pe_gate: pePass,
      pass_all_gates: allPass?.length || 0,
      funnel_efficiency: ((allPass?.length || 0) / (totalUniverse || 1) * 100).toFixed(1) + '%',
      qualified_stocks: allPass?.map(s => s.ticker).slice(0, 20) || []
    };
  } catch (err) {
    log.error({ err }, 'Failed to get qualifiers');
    throw err;
  }
}

// ────────────────────────────────────────────────────
// 8. BACKTEST BY SETUP
// ────────────────────────────────────────────────────

async function getBacktestBySetup() {
  try {
    const { data: outcomes } = await supabase
      .from('signal_outcomes')
      .select('*');

    // Define setups
    const setups = {
      'wave2_confluence_13f': (o) => o.entry_wave === 'W2' && o.confluence_score >= 0.8 && o.institutional_overlap >= 3,
      'wave2_confluence_no13f': (o) => o.entry_wave === 'W2' && o.confluence_score >= 0.8 && (o.institutional_overlap || 0) < 3,
      'wave2_no_confluence': (o) => o.entry_wave === 'W2' && (o.confluence_score || 0) < 0.8,
      'wave4_confluence': (o) => o.entry_wave === 'W4' && o.confluence_score >= 0.8,
      'confluence_only': (o) => o.confluence_score >= 0.8,
      'all_signals': (o) => true
    };

    const results = {};
    Object.keys(setups).forEach(setup => {
      const matching = outcomes?.filter(setups[setup]) || [];
      const won = matching.filter(o => o.status === 'won').length;
      results[setup] = {
        total_signals: matching.length,
        win_count: won,
        win_rate: matching.length > 0 ? ((won / matching.length) * 100).toFixed(1) : 0,
        avg_return: matching.length > 0 
          ? (matching.reduce((sum, o) => sum + (o.return_pct || 0), 0) / matching.length).toFixed(2)
          : 0
      };
    });

    return results;
  } catch (err) {
    log.error({ err }, 'Failed to get backtest by setup');
    throw err;
  }
}

// ────────────────────────────────────────────────────
// 9. RISK ASSESSMENT
// ────────────────────────────────────────────────────

async function getRiskAssessment(ticker) {
  try {
    const { data: stock } = await supabase
      .from('screener_results')
      .select('*')
      .eq('ticker', ticker)
      .limit(1);

    if (!stock || stock.length === 0) {
      throw new Error(`Stock ${ticker} not found`);
    }

    const s = stock[0];
    const atr = s.atr_14 || 0;
    const price = s.current_price || 0;
    const rangeWidth = (s.high_52w || 0) - (s.low_52w || 0);

    // Calculate Kelly Fraction
    const winRate = 0.72; // LOAD_THE_BOAT baseline
    const avgWin = 0.085;
    const avgLoss = 0.04;
    const kellyFraction = (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin;

    // Position sizing
    const portfolioSize = 100000;
    const positionPercent = Math.min(kellyFraction * 100, 5); // Cap at 5%
    const maxPositionSize = (portfolioSize * positionPercent / 100).toFixed(0);

    // Stop loss
    const stopLoss = price - (atr * 2);
    const riskPerShare = (price - stopLoss).toFixed(2);

    // DCA tranches (4 tranches, 25% each)
    const tranches = [
      { pct: 25, price: (price * 0.98).toFixed(2) },
      { pct: 25, price: (price * 0.95).toFixed(2) },
      { pct: 25, price: (price * 0.92).toFixed(2) },
      { pct: 25, price: (price * 0.88).toFixed(2) }
    ];

    return {
      ticker,
      current_price: price,
      atr_14: atr.toFixed(2),
      stop_loss: stopLoss.toFixed(2),
      risk_per_share: riskPerShare,
      kelly_fraction: kellyFraction.toFixed(3),
      max_position_pct: positionPercent.toFixed(2),
      max_position_dollars: maxPositionSize,
      shares_at_max_position: price > 0 ? Math.floor(maxPositionSize / price) : 0,
      dca_tranches: tranches
    };
  } catch (err) {
    log.error({ err }, 'Failed to get risk assessment');
    throw err;
  }
}

// ────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────

module.exports = {
  getCurrentMarketState,
  getTopSignalsToday,
  getSignalOutcomes,
  getFactorAccuracy,
  getWavePatternStats,
  getInstitutionalSnapshot,
  getFundamentalQualifiers,
  getBacktestBySetup,
  getRiskAssessment
};
