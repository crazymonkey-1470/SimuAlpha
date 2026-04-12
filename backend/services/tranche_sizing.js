/**
 * 5-Tranche DCA Position Sizing — Sprint 10B
 *
 * Deterministic tranche schedule with INCREASING sizes as
 * confirmation increases. Replaces equal 1/5 tranches with
 * 10/15/20/25/30% allocation.
 *
 * Also includes wave-based trim schedule for position management.
 */

// Tranches increase as confirmation increases
const TRANCHE_SCHEDULE = {
  1: { pct: 10, trigger: 'Wave C approaching support', cumulative: 10 },
  2: { pct: 15, trigger: 'Support confirmed (higher low)', cumulative: 25 },
  3: { pct: 20, trigger: 'Signs of reversal (higher high)', cumulative: 45 },
  4: { pct: 25, trigger: 'Trend confirmed (HH + HL series)', cumulative: 70 },
  5: { pct: 30, trigger: 'Wave 2 completion (0.50-0.618 Fib holds)', cumulative: 100 },
};

// Wave-based trim schedule
const TRIM_SCHEDULE = {
  'WAVE_3_TOP':      { sellPct: 20, remaining: 80, next: 'Wait for Wave 4 pullback' },
  'WAVE_4_COMPLETE': { action: 'ADD_BACK_TO_FULL', next: 'Hold for Wave 5' },
  'WAVE_5_TOP':      { sellPct: 50, remaining: 50, next: 'Impulse complete — defensive' },
  'WAVE_A_COMPLETE': { action: 'REENTER_IF_FUNDAMENTALS_PASS', next: 'Hold for Wave B' },
  'WAVE_B_REJECTION':{ action: 'TRIM_ON_REJECTION', next: 'Wait for Wave C' },
  'WAVE_C_COMPLETE': { action: 'FULL_CYCLE_RESTART', next: '5-tranche DCA begins' },
};

/**
 * Determine the current tranche recommendation based on wave position
 * and confirmation signals.
 */
function recommendTranche(stock, waveAnalysis) {
  const waveLabel = waveAnalysis?.wave_count_json?.primary_wave
    || waveAnalysis?.current_wave
    || null;

  // Check if we're in a trim/exit phase
  const trimAction = getTrimAction(waveLabel);
  if (trimAction) {
    return {
      type: 'TRIM',
      ...trimAction,
      trancheSchedule: TRANCHE_SCHEDULE,
    };
  }

  // Determine which buy tranche based on confirmation level
  let trancheNumber = 1;
  let confirmations = 0;

  // Confirmation 1: Near support (within 5% of 200WMA or Fib level)
  if (stock.pctFrom200WMA != null && Math.abs(stock.pctFrom200WMA) < 5) {
    confirmations++;
  }

  // Confirmation 2: Higher low formed
  if (stock.supportConfirmed || stock.hhHlPattern) {
    confirmations++;
  }

  // Confirmation 3: Higher high (reversal signal)
  if (stock.hhHlPattern) {
    confirmations++;
  }

  // Confirmation 4: Trend confirmed (sustained HH+HL pattern)
  if (stock.goldenCross) {
    confirmations++;
  }

  // Confirmation 5: Wave completion at Fib level
  if (stock.confluenceZone || stock.generationalBuy) {
    confirmations++;
  }

  trancheNumber = Math.min(Math.max(confirmations, 1), 5);
  const tranche = TRANCHE_SCHEDULE[trancheNumber];

  return {
    type: 'BUY',
    trancheNumber,
    tranchePct: tranche.pct,
    cumulativePct: tranche.cumulative,
    trigger: tranche.trigger,
    trancheSchedule: TRANCHE_SCHEDULE,
  };
}

/**
 * Get trim/exit action if wave position warrants it.
 */
function getTrimAction(waveLabel) {
  if (!waveLabel) return null;

  const label = String(waveLabel).toUpperCase();

  if (label.includes('WAVE 3') && (label.includes('TOP') || label.includes('PEAK'))) {
    return TRIM_SCHEDULE['WAVE_3_TOP'];
  }
  if (label.includes('WAVE 4') && label.includes('COMPLETE')) {
    return TRIM_SCHEDULE['WAVE_4_COMPLETE'];
  }
  if (label.includes('WAVE 5') && (label.includes('TOP') || label.includes('PEAK') || label.includes('COMPLETE'))) {
    return TRIM_SCHEDULE['WAVE_5_TOP'];
  }
  if (label.includes('WAVE A') && label.includes('COMPLETE')) {
    return TRIM_SCHEDULE['WAVE_A_COMPLETE'];
  }
  if (label.includes('WAVE B') && label.includes('REJECT')) {
    return TRIM_SCHEDULE['WAVE_B_REJECTION'];
  }
  if (label.includes('WAVE C') && label.includes('COMPLETE')) {
    return TRIM_SCHEDULE['WAVE_C_COMPLETE'];
  }

  return null;
}

module.exports = { recommendTranche, TRANCHE_SCHEDULE, TRIM_SCHEDULE };
