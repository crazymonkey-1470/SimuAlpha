/**
 * TLI Scoring Algorithm v3 — The Long Investor methodology
 * Sprint 10A Master Scorer
 *
 * Correct structure:
 *   Fundamental Screen (0-30) + Wave Position (0-30) + Confluence (0-40) = 100pts
 *
 * Pipeline order:
 *   1. Hard Gate (pass/fail)
 *   2. Lynch Screen (0-7)
 *   3. Buffett Screen (0-9)
 *   4. Financial Health Check (0-12)
 *   5. Downtrend Filter (0-8)
 *   6. Fundamental Score (0-30)
 *   7. Wave Position Score (-15 to +30)
 *   8. Confluence Score (0-40)
 *   9. Risk Filters (overrides)
 *   10. Signal Assignment
 */

const { fundamentalGate } = require('../pipeline/fundamental_gate');
const { lynchScreen } = require('../pipeline/lynch_screen');
const { buffettScreen } = require('../pipeline/buffett_screen');
const { healthCheck } = require('../pipeline/health_check');
const { downtrendFilter } = require('../pipeline/downtrend_filter');
const { scoreWavePosition } = require('../pipeline/wave_position_scorer');
const { scoreConfluence } = require('../pipeline/confluence_scorer');
const { applyRiskFilters } = require('../pipeline/risk_filters');

function computeTLIScoreV3(stock, waveAnalysis, macroContext, institutionalData, sainConsensus) {

  // ==========================================
  // STAGE 1: HARD GATE (pass/fail)
  // ==========================================
  const gate = fundamentalGate(stock);
  if (gate.disqualified) {
    return {
      totalScore: 0,
      signal: 'DISQUALIFIED',
      label: 'DISQUALIFIED',
      reason: `Failed gates: ${gate.failures.join(', ')}`,
      version: 'v3',
      gate,
      lynchScreen: null,
      buffettScreen: null,
      healthCheck: null,
      fundamentalScore: 0,
      waveScore: 0,
      confluenceScore: 0,
      sainBonus: 0,
      sentimentAdjustment: 0,
      waveAnalysis: null,
      confluenceAnalysis: null,
      downtrendFilter: null,
      riskFilters: null,
      dualScreenPass: false,
      targets: {},
      positionAction: 'AVOID',
      badges: [],
      disqualified: true,
      disqualifiedReasons: gate.failures,
    };
  }

  // ==========================================
  // STAGE 2: SCREENS (Lynch, Buffett, Health)
  // ==========================================
  const lynch = lynchScreen(stock);
  const buffett = buffettScreen(stock);
  const health = healthCheck(stock);

  const dualScreenPass = lynch.passesScreen && buffett.passesScreen;

  // ==========================================
  // STAGE 3: DOWNTREND CHECK
  // ==========================================
  const downtrend = downtrendFilter(stock);

  // ==========================================
  // LAYER 1: FUNDAMENTAL SCORE (0-30)
  // ==========================================
  let fundamentalScore = 0;

  // Revenue growth accelerating (+5)
  if (stock.revenueGrowthYoY != null && stock.revenueGrowthPriorYoY != null
      && stock.revenueGrowthYoY > stock.revenueGrowthPriorYoY) {
    fundamentalScore += 5;
  } else if (stock.revenueGrowthYoY != null && stock.revenueGrowthYoY > 10) {
    // Fallback: strong absolute growth even without acceleration data
    fundamentalScore += 3;
  }

  // Gross margin expanding (+5)
  if (stock.grossMarginCurrent != null && stock.grossMarginPriorYear != null
      && stock.grossMarginCurrent > stock.grossMarginPriorYear) {
    fundamentalScore += 5;
  } else if (stock.grossMarginCurrent != null && stock.grossMarginCurrent > 40) {
    // Fallback: strong absolute margin
    fundamentalScore += 2;
  }

  // Positive free cash flow (+5)
  if (stock.freeCashFlow != null && stock.freeCashFlow > 0) {
    fundamentalScore += 5;
  }

  // Low debt / strong balance sheet (+5)
  if (stock.debtToEquity != null && stock.debtToEquity < 0.5) {
    fundamentalScore += 5;
  } else if (stock.cashAndEquivalents != null && stock.totalDebt != null
             && stock.cashAndEquivalents > stock.totalDebt) {
    fundamentalScore += 5;
  }

  // Large TAM remaining (+5)
  if (stock.tamScore != null && stock.tamScore > 0) {
    fundamentalScore += Math.min(stock.tamScore, 5);
  } else if (stock.revenueGrowthYoY != null && stock.revenueGrowthYoY > 20) {
    // Proxy: fast-growing companies likely have TAM remaining
    fundamentalScore += 3;
  }

  // Competitive moat (+5)
  if (stock.moatScore != null) {
    if (stock.moatScore >= 4) fundamentalScore += 5;
    else if (stock.moatScore >= 2) fundamentalScore += 3;
  } else if (stock.moatTier != null) {
    // Use string moat tier as fallback
    const moatPts = { 'MONOPOLY': 5, 'STRONG_PLATFORM': 4, 'MODERATE': 2, 'NONE': 0 };
    fundamentalScore += moatPts[stock.moatTier] || 0;
  }

  fundamentalScore = Math.min(fundamentalScore, 30);

  // ==========================================
  // LAYER 2: WAVE POSITION SCORE (-15 to +30)
  // ==========================================
  const waveScore = scoreWavePosition(waveAnalysis);

  // ==========================================
  // LAYER 3: CONFLUENCE SCORE (0-40)
  // ==========================================
  const confluenceResult = scoreConfluence(stock, waveAnalysis);

  // ==========================================
  // TOTAL SCORE
  // ==========================================
  // Wave score can be negative but clamp at -15
  let totalScore = fundamentalScore + Math.max(waveScore.pts, -15) + confluenceResult.score;

  // Apply sentiment adjustment from risk filters
  const riskSignal = { action: waveScore.action };
  const riskFilters = applyRiskFilters(stock, waveAnalysis, riskSignal);
  totalScore += riskFilters.sentimentAdjustment;

  // SAIN bonus (from Sprint 9)
  let sainBonus = 0;
  if (sainConsensus) {
    if (sainConsensus.is_full_stack_consensus) {
      sainBonus = 15;
    } else if (sainConsensus.layers_aligned >= 3) {
      sainBonus = 8;
    }
  }
  totalScore += sainBonus;

  // Clamp 0-100
  totalScore = Math.max(0, Math.min(100, totalScore));

  // ==========================================
  // SIGNAL / LABEL ASSIGNMENT
  // ==========================================
  let label, signal;

  // Special badges override score-based labels
  if (confluenceResult.badge === 'GENERATIONAL_BUY') {
    label = 'GENERATIONAL SUPPORT ZONE'; signal = 'GENERATIONAL_BUY';
  } else if (sainConsensus?.is_full_stack_consensus) {
    label = 'FULL STACK CONSENSUS'; signal = 'FULL_STACK_CONSENSUS';
  } else if (confluenceResult.badge === 'CONFLUENCE_ZONE') {
    label = 'CONFLUENCE ZONE'; signal = 'CONFLUENCE_ZONE';
  } else if (waveScore.pts === -15) {
    label = 'ENDING DIAGONAL TOP'; signal = 'ENDING_DIAGONAL_TOP';
  } else if (waveScore.pts === -10) {
    label = 'WAVE B TRAP'; signal = 'WAVE_B_BOUNCE';
  } else if (downtrend.suppressBuySignals) {
    label = 'DOWNTREND ACTIVE'; signal = 'DOWNTREND_ACTIVE';
  } else if (totalScore >= 85) {
    label = 'LOAD THE BOAT'; signal = 'LOAD_THE_BOAT';
  } else if (totalScore >= 70) {
    label = 'ACCUMULATE'; signal = 'ACCUMULATE';
  } else if (totalScore >= 55) {
    label = 'WATCHLIST'; signal = 'WATCHLIST';
  } else if (totalScore >= 40) {
    label = 'HOLD'; signal = 'HOLD';
  } else if (totalScore >= 25) {
    label = 'CAUTION'; signal = 'CAUTION';
  } else if (totalScore >= 10) {
    label = 'TRIM'; signal = 'TRIM';
  } else {
    label = 'AVOID'; signal = 'AVOID';
  }

  // ==========================================
  // RISK FILTER OVERRIDES
  // ==========================================
  let riskFilterReason = null;
  let riskFilterPass = riskFilters.allPass;

  if (!riskFilters.allPass && ['LOAD_THE_BOAT', 'ACCUMULATE', 'WATCHLIST'].includes(signal)) {
    signal = signal + '_FILTERED';
    riskFilterReason = riskFilters.overrideReason;
  }

  if (downtrend.suppressBuySignals
      && !['GENERATIONAL_BUY', 'CONFLUENCE_ZONE'].includes(signal)) {
    if (['LOAD_THE_BOAT', 'ACCUMULATE'].includes(signal)) {
      signal = 'DOWNTREND_SUPPRESSED';
      label = 'Entry suppressed — downtrend score ' + downtrend.score + '/8';
      riskFilterPass = false;
    }
  }

  // ==========================================
  // ENTRY ZONE / NOTE (compatible with v2 output)
  // ==========================================
  const entryZone = ['LOAD_THE_BOAT', 'ACCUMULATE', 'CONFLUENCE_ZONE', 'GENERATIONAL_BUY', 'FULL_STACK_CONSENSUS'].includes(signal);
  let entryNote = '';
  if (entryZone) {
    const parts = [];
    if (confluenceResult.supports.length > 0) {
      parts.push(`Support stack: ${confluenceResult.supports.slice(0, 4).join(', ')}`);
    }
    if (waveScore.label) parts.push(waveScore.label);
    entryNote = parts.join(' | ');
  } else if (signal === 'WATCHLIST') {
    entryNote = 'Approaching entry zone — monitor for support confirmation';
  }

  // Map v3 signal names back to v2 display names for backward compatibility
  const displaySignal = mapSignalToDisplay(signal);

  return {
    totalScore,
    signal: displaySignal,
    label,
    version: 'v3',
    entryZone,
    entryNote,

    // Score breakdown
    fundamentalScore,
    waveScore: waveScore.pts,
    confluenceScore: confluenceResult.score,
    sainBonus,
    sentimentAdjustment: riskFilters.sentimentAdjustment,

    // V2 backward-compatible fields
    fundamentalBase: fundamentalScore,
    technicalScore: Math.max(waveScore.pts, 0), // never negative for v2 compat
    technicalBase: Math.max(waveScore.pts, 0),
    bonusPoints: sainBonus + (riskFilters.sentimentAdjustment > 0 ? riskFilters.sentimentAdjustment : 0),
    penaltyPoints: (riskFilters.sentimentAdjustment < 0 ? riskFilters.sentimentAdjustment : 0)
                   + (waveScore.pts < 0 ? waveScore.pts : 0),
    earningsQualityAdj: 0,
    waveBonus: confluenceResult.badge ? 15 : 0,
    scoreV1: null,

    // Pct calculations (carried through from stock data)
    pctFrom52wHigh: stock.pctFrom52wHigh ?? null,
    pctFrom200WMA: stock.pctFrom200WMA ?? null,
    pctFrom200MMA: stock.pctFrom200MMA ?? null,
    returnTo200wmaPct: stock.returnTo200wmaPct ?? null,
    confluenceZone: confluenceResult.badge === 'CONFLUENCE_ZONE',
    confluenceNote: confluenceResult.supports.join(', '),
    generationalBuy: confluenceResult.badge === 'GENERATIONAL_BUY',

    // Screens
    lynchScreen: lynch,
    buffettScreen: buffett,
    dualScreenPass,
    healthCheck: health,

    // Analysis
    waveAnalysis: waveScore,
    confluenceAnalysis: confluenceResult,
    downtrendFilter: downtrend,
    riskFilters,
    gate,

    // Wave targets
    targets: waveAnalysis?.key_levels || {},
    positionAction: waveScore.action,

    // Flags (backward compatible)
    flags: [
      lynch.badge,
      dualScreenPass ? 'DUAL_SCREEN_PASS' : null,
      confluenceResult.badge,
      sainConsensus?.is_full_stack_consensus ? 'FULL_STACK_CONSENSUS' : null,
      downtrend.suppressBuySignals ? 'DOWNTREND_ACTIVE' : null,
      ...downtrend.signals,
    ].filter(Boolean),

    // Badges
    badges: [
      lynch.badge,
      dualScreenPass ? 'DUAL_SCREEN_PASS' : null,
      confluenceResult.badge,
      sainConsensus?.is_full_stack_consensus ? 'FULL_STACK_CONSENSUS' : null,
    ].filter(Boolean),

    // V3 specific columns
    scoringVersion: 'v3',
    lynchScore: lynch.score,
    buffettScore: buffett.score,
    healthRedFlags: health.redFlagCount,
    downtrendScore: downtrend.score,
    downtrendSuppressed: downtrend.suppressBuySignals,
    wavePosition: waveScore.wave,
    positionActionLabel: waveScore.action,
    riskFilterPass,
    riskFilterReason,
    supportConfirmed: riskFilters.supportConfirmed,
    disqualified: false,
    disqualifiedReasons: [],

    // Score breakdown for API
    scoreBreakdown: {
      fundamental: { score: fundamentalScore, max: 30 },
      wave: { score: waveScore.pts, max: 30, wave: waveScore.wave, action: waveScore.action },
      confluence: { score: confluenceResult.score, max: 40, supports: confluenceResult.supports },
      lynch: { score: lynch.score, max: 7, passes: lynch.passes },
      buffett: { score: buffett.score, max: 9, passes: buffett.passes },
      health: { score: health.healthScore, max: 12, redFlags: health.redFlags },
      downtrend: { score: downtrend.score, max: 8, signals: downtrend.signals },
      sain: { bonus: sainBonus, fullStack: sainConsensus?.is_full_stack_consensus || false },
    },
  };
}

/**
 * Map v3 internal signal names to display names
 * that are backward-compatible with existing frontend.
 */
function mapSignalToDisplay(signal) {
  const map = {
    'LOAD_THE_BOAT': 'LOAD THE BOAT',
    'LOAD_THE_BOAT_FILTERED': 'LOAD THE BOAT',
    'ACCUMULATE_FILTERED': 'ACCUMULATE',
    'WATCHLIST_FILTERED': 'WATCH',
    'WATCHLIST': 'WATCH',
    'DOWNTREND_SUPPRESSED': 'WATCH',
    'DOWNTREND_ACTIVE': 'WATCH',
    'ENDING_DIAGONAL_TOP': 'PASS',
    'WAVE_B_BOUNCE': 'PASS',
    'CAUTION': 'WATCH',
    'TRIM': 'PASS',
    'AVOID': 'PASS',
    'HOLD': 'WATCH',
  };
  return map[signal] || signal;
}

module.exports = { computeTLIScoreV3 };
