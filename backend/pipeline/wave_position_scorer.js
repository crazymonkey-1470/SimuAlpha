/**
 * Wave Position Scoring — 0-30pts, can be negative (Sprint 10A, Task 6)
 *
 * Replaces flat technical scoring with wave-aware scoring
 * that subtracts points for dangerous positions.
 */

const WAVE_SCORES = {
  'WAVE_C_BOTTOM':        { pts: 30, label: 'Cycle reset — maximum conviction re-entry', action: 'FULL_RESTART' },
  'WAVE_2_BOTTOM':        { pts: 25, label: 'Primary entry zone — Wave 2 at 0.618 Fib', action: 'ENTER' },
  'WAVE_4_SUPPORT':       { pts: 20, label: 'Add to winner — Wave 4 holding 0.382', action: 'ADD' },
  'WAVE_4_BOTTOM':        { pts: 20, label: 'Add to winner — Wave 4 holding support', action: 'ADD' },
  'WAVE_A_BOTTOM':        { pts: 15, label: 'Re-entry zone — only if fundamentals pass', action: 'CONDITIONAL_REENTRY' },
  'WAVE_1_FORMING':       { pts: 10, label: 'Early trend — unconfirmed', action: 'WATCH' },
  'WAVE_3_IN_PROGRESS':   { pts: 5,  label: 'Hold only — do not chase', action: 'HOLD' },
  'WAVE_5_IN_PROGRESS':   { pts: 0,  label: 'Target zone reached — consider reducing', action: 'TRIM' },
  'WAVE_B_BOUNCE':        { pts: -10, label: 'Exit liquidity trap — DO NOT ENTER', action: 'AVOID' },
  'ENDING_DIAGONAL_W5':   { pts: -15, label: 'TOP WARNING — sharp reversal imminent', action: 'EXIT' },
  'ENDING_DIAGONAL_WARNING': { pts: -15, label: 'TOP WARNING — ending diagonal pattern', action: 'EXIT' },
};

function scoreWavePosition(waveAnalysis) {
  if (!waveAnalysis || !waveAnalysis.current_wave) {
    return { pts: 0, label: 'Unknown wave position', action: 'WAIT', wave: null, confidence: 0 };
  }

  const wave = waveAnalysis.current_wave;
  // Also check tli_signal as a fallback key
  const key = wave || waveAnalysis.tli_signal;
  const config = WAVE_SCORES[key] || { pts: 0, label: 'Unknown wave', action: 'WAIT' };

  return {
    pts: config.pts,
    label: config.label,
    action: config.action,
    wave: key,
    confidence: waveAnalysis.confidence_score || waveAnalysis.confidence || 0,
  };
}

module.exports = { scoreWavePosition, WAVE_SCORES };
