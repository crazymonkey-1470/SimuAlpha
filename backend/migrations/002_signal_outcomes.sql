-- ═══════════════════════════════════════════════════════════════
-- Migration 002: signal_outcomes
-- ═══════════════════════════════════════════════════════════════
-- Ground-truth outcomes for live fired signals. Consumed by the
-- learning_cycle_v2 service to compute factor accuracy.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS signal_outcomes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id      TEXT,
  ticker         TEXT        NOT NULL,
  tier           TEXT        NOT NULL,
  entry_price    NUMERIC(18,6) NOT NULL CHECK (entry_price > 0),
  exit_price     NUMERIC(18,6) NOT NULL CHECK (exit_price  > 0),
  return_pct     NUMERIC(10,4) NOT NULL,
  success        BOOLEAN     NOT NULL,
  hold_days      INTEGER     NOT NULL CHECK (hold_days > 0),
  factor         TEXT,
  factors        JSONB       DEFAULT '[]'::jsonb,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Query patterns in learning_cycle_v2.js:
--   - filter by factor, count successes                  → (factor, success)
--   - rolling window by recorded_at                      → (recorded_at DESC)
--   - tier-level cohort aggregation                      → (tier, recorded_at DESC)
--   - ticker drill-down                                  → (ticker, recorded_at DESC)
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_factor
  ON signal_outcomes (factor) WHERE factor IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signal_outcomes_factor_success
  ON signal_outcomes (factor, success) WHERE factor IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signal_outcomes_recorded
  ON signal_outcomes (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_signal_outcomes_tier_recorded
  ON signal_outcomes (tier, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_signal_outcomes_ticker_recorded
  ON signal_outcomes (ticker, recorded_at DESC);

-- GIN index on the factors array for multi-factor queries like
--   WHERE factors @> '["wave_3_confluence"]'
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_factors_gin
  ON signal_outcomes USING GIN (factors);

COMMENT ON TABLE  signal_outcomes IS 'Live-fired signal outcomes used by learning_cycle_v2.';
COMMENT ON COLUMN signal_outcomes.factor  IS 'Primary factor that drove the signal (e.g. wave_3_confluence).';
COMMENT ON COLUMN signal_outcomes.factors IS 'All contributing factors for this signal (JSONB array).';
