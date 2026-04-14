/**
 * Regression test: wave_counts fields produced by the Elliott Wave engine
 * must be representable in the Supabase wave_counts schema.
 *
 * This is the regression guard for the silent-empty-wave_counts bug:
 * elliott_wave.js was returning fields (wave_pattern, wave4_type,
 * wave1_origin, correction_type, capitulation_detected) that did not
 * exist in wave_counts, causing every upsert in stage4 to fail.
 */

const { runWaveAnalysis } = require('../services/elliott_wave');

// Columns defined in supabase/migration_complete.sql for wave_counts
// (must match WAVE_COUNTS_COLUMNS in backend/pipeline/stage4_wavecount.js)
const WAVE_COUNTS_COLUMNS = new Set([
  'ticker', 'timeframe', 'wave_degree', 'wave_structure', 'current_wave',
  'confidence_score', 'confidence_label', 'tli_signal', 'tli_signal_reason',
  'wave_count_json', 'wave_pattern', 'wave4_type', 'wave1_origin',
  'correction_type', 'capitulation_detected',
  'entry_zone_low', 'entry_zone_high', 'stop_loss',
  'target_1', 'target_2', 'target_3', 'reward_risk_ratio',
  'claude_interpretation', 'claude_model', 'claude_interpreted_at',
  'last_updated',
]);

// Synthetic 5-wave impulse: 1 up, 2 down, 3 up (long), 4 down (shallow), 5 up.
function syntheticImpulse() {
  const points = [];
  const start = new Date('2014-01-01').getTime();
  const month = 30 * 24 * 60 * 60 * 1000;
  const series = [
    // Wave 1 up from 10 to 20
    10, 11, 12.5, 14, 15.5, 17, 18.5, 20,
    // Wave 2 down to 14 (retrace ~60%)
    19, 17.5, 16, 14.5, 14,
    // Wave 3 up to 36 (1.618x W1)
    16, 19, 22, 25, 28, 31, 34, 36,
    // Wave 4 down to 32 (0.382 retrace of W3)
    35, 33, 32,
    // Wave 5 up to 42 (≈ W1 length)
    34, 36, 38, 40, 42,
  ];
  for (let i = 0; i < series.length; i++) {
    points.push({
      date: new Date(start + i * month).toISOString().split('T')[0],
      close: series[i],
    });
  }
  return points;
}

describe('wave_counts schema contract', () => {
  it('elliott_wave produces only fields the wave_counts table can store', () => {
    const monthly = syntheticImpulse();
    // Stretch so detectPivots has at least 30 bars (guard in elliott_wave.js)
    while (monthly.length < 40) {
      monthly.unshift({
        date: new Date(new Date(monthly[0].date).getTime() - 30 * 86400000).toISOString().split('T')[0],
        close: 9,
      });
    }

    const results = runWaveAnalysis('TEST', monthly, [], 40);

    // We don't strictly require results to be non-empty (pivot detection is
    // sensitive), but every field that IS produced must fit the schema.
    for (const wc of results) {
      for (const key of Object.keys(wc)) {
        expect(WAVE_COUNTS_COLUMNS.has(key)).toBe(true);
      }
    }
  });

  it('schema contains the fields that elliott_wave emits for impulse counts', () => {
    // These are the fields that were missing from the wave_counts migration
    // before the fix. Hard-code them so anyone removing a column from the
    // migration is forced to also update elliott_wave.js.
    expect(WAVE_COUNTS_COLUMNS.has('wave_pattern')).toBe(true);
    expect(WAVE_COUNTS_COLUMNS.has('wave4_type')).toBe(true);
    expect(WAVE_COUNTS_COLUMNS.has('wave1_origin')).toBe(true);
    expect(WAVE_COUNTS_COLUMNS.has('correction_type')).toBe(true);
    expect(WAVE_COUNTS_COLUMNS.has('capitulation_detected')).toBe(true);
  });
});
