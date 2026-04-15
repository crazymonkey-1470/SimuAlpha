-- ═══════════════════════════════════════════════════════════════
-- Migration 001: backtest_runs
-- ═══════════════════════════════════════════════════════════════
-- Stores individual signal backtest results from backtester_v2.
-- One row per (signal, hold_period) evaluated against historical prices.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS backtest_runs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker            TEXT        NOT NULL,
  signal_tier       TEXT        NOT NULL,
  entry_price       NUMERIC(18,6) NOT NULL CHECK (entry_price > 0),
  exit_price        NUMERIC(18,6) NOT NULL CHECK (exit_price  > 0),
  return_pct        NUMERIC(10,4) NOT NULL,
  hold_days         INTEGER     NOT NULL CHECK (hold_days > 0),
  win               BOOLEAN     GENERATED ALWAYS AS (return_pct > 0) STORED,
  entry_timestamp   TIMESTAMPTZ,
  exit_timestamp    TIMESTAMPTZ,
  metadata          JSONB       DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for the common query patterns in tier_routes.js:
--   - summary aggregates by tier                    → (signal_tier)
--   - by-tier list ordered by recency               → (signal_tier, created_at DESC)
--   - per-ticker lookup                             → (ticker, created_at DESC)
--   - rolling windows of recent runs                → (created_at DESC)
CREATE INDEX IF NOT EXISTS idx_backtest_runs_tier
  ON backtest_runs (signal_tier);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_tier_created
  ON backtest_runs (signal_tier, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_ticker_created
  ON backtest_runs (ticker, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backtest_runs_created
  ON backtest_runs (created_at DESC);

-- Prevent duplicate insertion of the same (ticker, tier, entry_timestamp, hold_days) run.
-- Upserts from the backtester use this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS uq_backtest_runs_signal_hold
  ON backtest_runs (ticker, signal_tier, entry_timestamp, hold_days)
  WHERE entry_timestamp IS NOT NULL;

COMMENT ON TABLE  backtest_runs IS 'Individual signal backtest results (backtester_v2).';
COMMENT ON COLUMN backtest_runs.signal_tier IS 'LOAD_THE_BOAT | STRONG_BUY | BUY | HOLD | AVOID';
COMMENT ON COLUMN backtest_runs.win IS 'Generated: return_pct > 0.';
