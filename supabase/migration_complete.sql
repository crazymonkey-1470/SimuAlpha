-- ══════════════════════════════════════════════════════════════════════
-- SimuAlpha / The Long Screener — COMPLETE DATABASE SCHEMA
-- ══════════════════════════════════════════════════════════════════════
-- Consolidated from: migration.sql + migration_sprint6a.sql + migration_sprint6b.sql
-- Plus all missing columns/tables discovered via code audit.
--
-- Safe to run on a fresh Supabase project OR on an existing one.
-- Uses IF NOT EXISTS / IF NOT EXISTS throughout — will not destroy data.
--
-- Run this ONCE in the Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════════


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 1: universe (Stage 1 output)                              │
-- │  Full market universe — NYSE + NASDAQ investable stocks          │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS universe (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker        TEXT        NOT NULL UNIQUE,
  company_name  TEXT,
  exchange      TEXT,
  sector        TEXT,
  industry      TEXT,
  market_cap    NUMERIC,
  last_updated  TIMESTAMPTZ DEFAULT NOW()
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 2: screener_candidates (Stage 2 output)                   │
-- │  Pre-screened universe survivors (~200-400 tickers)              │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS screener_candidates (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker              TEXT        NOT NULL UNIQUE,
  company_name        TEXT,
  sector              TEXT,
  market_cap          NUMERIC,
  current_price       NUMERIC,
  revenue_growth_pct  NUMERIC,
  pct_from_52w_high   NUMERIC,
  prescreen_score     INTEGER     DEFAULT 0,
  last_updated        TIMESTAMPTZ DEFAULT NOW()
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 3: screener_results (Stage 3 output)                      │
-- │  Deep-scored stocks with TLI signal + fundamentals               │
-- │  This is the most-queried table in the system.                   │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS screener_results (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker              TEXT        NOT NULL UNIQUE,
  company_name        TEXT,
  sector              TEXT,
  current_price       NUMERIC,
  price_200wma        NUMERIC,
  price_200mma        NUMERIC,
  pct_from_200wma     NUMERIC,
  pct_from_200mma     NUMERIC,
  revenue_current     NUMERIC,
  revenue_prior_year  NUMERIC,
  revenue_growth_pct  NUMERIC,
  pe_ratio            NUMERIC,
  ps_ratio            NUMERIC,
  week_52_high        NUMERIC,
  pct_from_52w_high   NUMERIC,
  fundamental_score   INTEGER,
  technical_score     INTEGER,
  total_score         INTEGER,
  previous_score      INTEGER,
  signal              TEXT,
  previous_signal     TEXT,
  entry_zone          BOOLEAN,
  entry_note          TEXT,
  last_updated        TIMESTAMPTZ DEFAULT NOW()
);

-- Sprint 5 columns (stage3 + stage4 additions)
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS week_52_low NUMERIC;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS confluence_zone BOOLEAN;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS confluence_note TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS revenue_history JSONB;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS gross_margin_current NUMERIC;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS gross_margin_history JSONB;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS volume_trend TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS volume_trend_ratio NUMERIC;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS ma_50d NUMERIC;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS golden_cross BOOLEAN;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS death_cross BOOLEAN;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS hh_hl_pattern BOOLEAN;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS generational_buy BOOLEAN DEFAULT FALSE;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS return_to_200wma_pct NUMERIC;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS bull_bear_line NUMERIC;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS sector_avg_score NUMERIC;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS sector_rank TEXT;

-- Sprint 6A columns (enhanced scoring engine)
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS score_v1 INTEGER;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS fundamental_base INTEGER;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS technical_base INTEGER;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS bonus_points INTEGER;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS penalty_points INTEGER;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS earnings_quality_adj INTEGER;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS wave_bonus INTEGER;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS flags TEXT[];
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS institutional_holders INTEGER;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS institutional_consensus TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS moat_tier TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS fcf_margin DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS fcf_growth_yoy DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS revenue_growth_3yr DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS revenue_growth_qoq DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS revenue_growth_prior_qoq DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS earnings_quality_score TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS forward_pe DECIMAL(8,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS debt_to_equity DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS cash_and_equivalents BIGINT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS total_debt BIGINT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS shares_outstanding_change DECIMAL(6,4);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS dividend_yield DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS free_cash_flow BIGINT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS capex BIGINT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS eps_gaap DECIMAL(8,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS eps_diluted DECIMAL(8,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS sector_avg_pe DECIMAL(8,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS score_breakdown JSONB;

-- Sprint 6B columns (valuation engine)
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS valuation_rating TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS avg_price_target DECIMAL(10,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS avg_upside_pct DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS dcf_price_target DECIMAL(10,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS ev_sales_price_target DECIMAL(10,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS ev_ebitda_price_target DECIMAL(10,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS wacc_risk_tier TEXT;

-- Sprint 7 columns (data pipeline fixes + enrichment)
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS operating_margin DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS ttm_ebitda BIGINT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS diluted_shares BIGINT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS shares_outstanding BIGINT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS beta DECIMAL(6,3);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS ev_sales_5yr_avg DECIMAL(8,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS ev_ebitda_5yr_avg DECIMAL(8,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS gaap_nongaap_divergence DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS operating_income BIGINT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS net_income BIGINT;


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 4: signal_alerts                                          │
-- │  Alert log — signal changes + wave buy zones                     │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS signal_alerts (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker            TEXT        NOT NULL,
  company_name      TEXT,
  alert_type        TEXT,
  previous_signal   TEXT,
  new_signal        TEXT,
  score             INTEGER,
  current_price     NUMERIC,
  price_200wma      NUMERIC,
  price_200mma      NUMERIC,
  entry_note        TEXT,
  claude_narrative   TEXT,
  claude_conviction  TEXT,
  fired_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 5: exit_signals (Stage 4 output)                          │
-- │  Exit/trim signals from Elliott Wave analysis                    │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS exit_signals (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker            TEXT        NOT NULL,
  signal_type       TEXT        NOT NULL,
  severity          TEXT        DEFAULT 'MEDIUM',
  signal_reason     TEXT,
  price_at_signal   NUMERIC,
  target_price      NUMERIC,
  acknowledged      BOOLEAN     DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 6: wave_counts (Stage 4 output)                           │
-- │  Elliott Wave analysis per ticker/timeframe/degree               │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS wave_counts (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker                TEXT        NOT NULL,
  timeframe             TEXT        NOT NULL,
  wave_degree           TEXT        NOT NULL,
  wave_structure        TEXT,
  current_wave          TEXT,
  confidence_score      INTEGER,
  confidence_label      TEXT,
  tli_signal            TEXT,
  tli_signal_reason     TEXT,
  wave_count_json       JSONB,
  entry_zone_low        NUMERIC,
  entry_zone_high       NUMERIC,
  stop_loss             NUMERIC,
  target_1              NUMERIC,
  target_2              NUMERIC,
  target_3              NUMERIC,
  reward_risk_ratio     NUMERIC,
  claude_interpretation JSONB,
  claude_model          TEXT,
  claude_interpreted_at TIMESTAMPTZ,
  last_updated          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticker, timeframe, wave_degree)
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 7: backtest_results                                       │
-- │  Individual historical backtest signals (trades)                 │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS backtest_results (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker            TEXT        NOT NULL,
  timeframe         TEXT,
  wave_degree       TEXT,
  signal_date       TEXT,
  signal_wave       TEXT,
  entry_price       NUMERIC,
  stop_loss         NUMERIC,
  target_1          NUMERIC,
  target_2          NUMERIC,
  outcome           TEXT,
  exit_price        NUMERIC,
  exit_date         TEXT,
  hold_days         INTEGER,
  pct_return        NUMERIC,
  max_drawdown_pct  NUMERIC,
  max_gain_pct      NUMERIC
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 8: backtest_summary                                       │
-- │  Aggregated backtest performance per ticker                      │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS backtest_summary (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker            TEXT        NOT NULL UNIQUE,
  total_signals     INTEGER,
  winning_signals   INTEGER,
  win_rate_pct      NUMERIC,
  avg_return_pct    NUMERIC,
  avg_hold_days     INTEGER,
  avg_reward_risk   NUMERIC,
  best_return_pct   NUMERIC,
  worst_return_pct  NUMERIC,
  total_return_pct  NUMERIC,
  vs_spy_pct        NUMERIC,
  last_updated      TIMESTAMPTZ DEFAULT NOW()
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 9: watchlist                                               │
-- │  User's personal ticker watchlist                                │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS watchlist (
  id        UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker    TEXT        NOT NULL UNIQUE,
  added_at  TIMESTAMPTZ DEFAULT NOW(),
  notes     TEXT
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 10: scan_history                                          │
-- │  Pipeline run logs with summary stats                            │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS scan_history (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  stage               TEXT,
  tickers_processed   INTEGER,
  tickers_passed      INTEGER,
  load_the_boat_count INTEGER,
  accumulate_count    INTEGER,
  alerts_fired        INTEGER,
  top_opportunities   JSONB,
  scanned_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 11: super_investors (Sprint 6A)                           │
-- │  Registry of 8 tracked super investors                           │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS super_investors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  cik              TEXT NOT NULL UNIQUE,
  fund_name        TEXT NOT NULL,
  philosophy       TEXT,
  style_tags       TEXT[],
  portfolio_value_latest BIGINT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 12: investor_holdings (Sprint 6A)                         │
-- │  Quarterly 13F holdings snapshot per investor                    │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS investor_holdings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id      UUID REFERENCES super_investors(id),
  quarter          TEXT NOT NULL,
  ticker           TEXT NOT NULL,
  cusip            TEXT,
  company_name     TEXT,
  shares           BIGINT NOT NULL,
  market_value     BIGINT NOT NULL,
  pct_of_portfolio DECIMAL(5,2),
  portfolio_rank   INT,
  has_call_options BOOLEAN DEFAULT FALSE,
  has_put_options  BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(investor_id, quarter, ticker)
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 13: investor_signals (Sprint 6A)                          │
-- │  Computed quarterly changes (derived from holdings diff)         │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS investor_signals (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id        UUID REFERENCES super_investors(id),
  ticker             TEXT NOT NULL,
  quarter            TEXT NOT NULL,
  signal_type        TEXT NOT NULL,
  shares_changed     BIGINT,
  pct_change         DECIMAL(8,2),
  est_avg_price      DECIMAL(10,2),
  conviction_level   TEXT,
  consecutive_quarters_same_direction INT DEFAULT 1,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(investor_id, quarter, ticker)
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 14: consensus_signals (Sprint 6A)                         │
-- │  Aggregated cross-investor consensus per ticker                  │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS consensus_signals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker            TEXT NOT NULL,
  quarter           TEXT NOT NULL,
  holders_count     INT,
  new_buyers_count  INT,
  sellers_count     INT,
  net_sentiment     TEXT,
  consensus_score   INT,
  sector_consensus  TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticker, quarter)
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 15: macro_context (Sprint 6B)                             │
-- │  Market cycle, liquidity, carry trade, geopolitical context      │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS macro_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  -- Market Cycle
  sp500_pe DECIMAL(5,1),
  sp500_pe_vs_140yr_avg DECIMAL(5,1),
  vix DECIMAL(5,2),
  -- Dollar / Liquidity
  dxy_index DECIMAL(6,2),
  dxy_direction TEXT,
  eur_usd_basis DECIMAL(6,2),
  -- Carry Trade
  boj_rate DECIMAL(4,2),
  fed_rate DECIMAL(4,2),
  carry_spread DECIMAL(4,2),
  jpy_usd DECIMAL(6,2),
  jpy_near_intervention BOOLEAN,
  -- Geopolitical
  iran_war_active BOOLEAN DEFAULT TRUE,
  geopolitical_risk_level TEXT,
  -- Super Investor Defensive Count
  investors_defensive_count INT,
  berkshire_cash_equity_ratio DECIMAL(4,2),
  spy_puts_count INT,
  -- Computed Risk Level
  market_risk_level TEXT,
  late_cycle_score INT,
  carry_trade_risk TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date)
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 16: stock_valuations (Sprint 6B)                          │
-- │  Three-pillar valuation: DCF + EV/Sales + EV/EBITDA             │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS stock_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  computed_date DATE NOT NULL,
  -- DCF
  dcf_growth_rate DECIMAL(5,2),
  dcf_terminal_rate DECIMAL(5,2),
  dcf_wacc DECIMAL(5,2),
  dcf_price_target DECIMAL(10,2),
  dcf_upside_pct DECIMAL(6,2),
  -- EV/Sales
  ev_sales_multiple DECIMAL(5,1),
  ev_sales_price_target DECIMAL(10,2),
  ev_sales_upside_pct DECIMAL(6,2),
  -- EV/EBITDA
  ev_ebitda_multiple DECIMAL(5,1),
  ev_ebitda_price_target DECIMAL(10,2),
  ev_ebitda_upside_pct DECIMAL(6,2),
  -- Average
  avg_price_target DECIMAL(10,2),
  avg_upside_pct DECIMAL(6,2),
  -- Rating
  tli_rating TEXT,
  -- Risk
  wacc_risk_tier TEXT,
  current_price DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticker, computed_date)
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 17: signal_outcomes (Sprint 6B)                           │
-- │  Tracks actionable signals and their outcomes over time          │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS signal_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  signal_date DATE NOT NULL,
  signal_type TEXT NOT NULL,
  score_at_signal INT,
  price_at_signal DECIMAL(10,2),
  -- Tracked outcomes at intervals
  price_3mo DECIMAL(10,2),
  price_6mo DECIMAL(10,2),
  price_12mo DECIMAL(10,2),
  price_24mo DECIMAL(10,2),
  return_3mo DECIMAL(6,2),
  return_6mo DECIMAL(6,2),
  return_12mo DECIMAL(6,2),
  return_24mo DECIMAL(6,2),
  -- Wave accuracy
  predicted_wave TEXT,
  actual_wave_outcome TEXT,
  wave_target_hit BOOLEAN,
  -- Scoring weights at time of signal
  scoring_version TEXT,
  scoring_weights JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 18: scoring_accuracy (Sprint 6B)                          │
-- │  Aggregated accuracy metrics per scoring version/period          │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS scoring_accuracy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL,
  scoring_version TEXT NOT NULL,
  total_signals INT,
  load_the_boat_win_rate DECIMAL(5,2),
  accumulate_win_rate DECIMAL(5,2),
  avg_return_3mo DECIMAL(6,2),
  avg_return_6mo DECIMAL(6,2),
  avg_return_12mo DECIMAL(6,2),
  elliott_wave_accuracy DECIMAL(5,2),
  best_performing_factor TEXT,
  worst_performing_factor TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ══════════════════════════════════════════════════════════════════════
-- FOREIGN KEYS
-- ══════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_watchlist_ticker'
  ) THEN
    ALTER TABLE watchlist
      ADD CONSTRAINT fk_watchlist_ticker
      FOREIGN KEY (ticker) REFERENCES screener_results(ticker)
      ON DELETE CASCADE;
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE universe ENABLE ROW LEVEL SECURITY;
ALTER TABLE screener_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE screener_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exit_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE wave_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE consensus_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE macro_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_accuracy ENABLE ROW LEVEL SECURITY;

-- Public read policies (frontend reads via anon key)
-- Backend uses service_role key which bypasses RLS entirely
DO $$
BEGIN
  -- universe
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read universe') THEN
    CREATE POLICY "Public read universe" ON universe FOR SELECT USING (true);
  END IF;

  -- screener_candidates
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read candidates') THEN
    CREATE POLICY "Public read candidates" ON screener_candidates FOR SELECT USING (true);
  END IF;

  -- screener_results
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read screener_results') THEN
    CREATE POLICY "Public read screener_results" ON screener_results FOR SELECT USING (true);
  END IF;

  -- signal_alerts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read signal_alerts') THEN
    CREATE POLICY "Public read signal_alerts" ON signal_alerts FOR SELECT USING (true);
  END IF;

  -- exit_signals
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read exit_signals') THEN
    CREATE POLICY "Public read exit_signals" ON exit_signals FOR SELECT USING (true);
  END IF;

  -- wave_counts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read wave_counts') THEN
    CREATE POLICY "Public read wave_counts" ON wave_counts FOR SELECT USING (true);
  END IF;

  -- backtest_results
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read backtest_results') THEN
    CREATE POLICY "Public read backtest_results" ON backtest_results FOR SELECT USING (true);
  END IF;

  -- backtest_summary
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read backtest_summary') THEN
    CREATE POLICY "Public read backtest_summary" ON backtest_summary FOR SELECT USING (true);
  END IF;

  -- scan_history
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read scan_history') THEN
    CREATE POLICY "Public read scan_history" ON scan_history FOR SELECT USING (true);
  END IF;

  -- watchlist: full CRUD
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read watchlist') THEN
    CREATE POLICY "Public read watchlist" ON watchlist FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public insert watchlist') THEN
    CREATE POLICY "Public insert watchlist" ON watchlist FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public update watchlist') THEN
    CREATE POLICY "Public update watchlist" ON watchlist FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public delete watchlist') THEN
    CREATE POLICY "Public delete watchlist" ON watchlist FOR DELETE USING (true);
  END IF;

  -- super_investors
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read super_investors') THEN
    CREATE POLICY "Public read super_investors" ON super_investors FOR SELECT USING (true);
  END IF;

  -- investor_holdings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read investor_holdings') THEN
    CREATE POLICY "Public read investor_holdings" ON investor_holdings FOR SELECT USING (true);
  END IF;

  -- investor_signals
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read investor_signals') THEN
    CREATE POLICY "Public read investor_signals" ON investor_signals FOR SELECT USING (true);
  END IF;

  -- consensus_signals
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read consensus_signals') THEN
    CREATE POLICY "Public read consensus_signals" ON consensus_signals FOR SELECT USING (true);
  END IF;

  -- macro_context
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read macro_context') THEN
    CREATE POLICY "Public read macro_context" ON macro_context FOR SELECT USING (true);
  END IF;

  -- stock_valuations
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read stock_valuations') THEN
    CREATE POLICY "Public read stock_valuations" ON stock_valuations FOR SELECT USING (true);
  END IF;

  -- signal_outcomes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read signal_outcomes') THEN
    CREATE POLICY "Public read signal_outcomes" ON signal_outcomes FOR SELECT USING (true);
  END IF;

  -- scoring_accuracy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read scoring_accuracy') THEN
    CREATE POLICY "Public read scoring_accuracy" ON scoring_accuracy FOR SELECT USING (true);
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════════
-- PERFORMANCE INDEXES
-- ══════════════════════════════════════════════════════════════════════

-- screener_results (most queried table)
CREATE INDEX IF NOT EXISTS idx_screener_score      ON screener_results(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_screener_signal     ON screener_results(signal);
CREATE INDEX IF NOT EXISTS idx_screener_ticker     ON screener_results(ticker);
CREATE INDEX IF NOT EXISTS idx_screener_entry      ON screener_results(entry_zone) WHERE entry_zone = true;
CREATE INDEX IF NOT EXISTS idx_screener_flags      ON screener_results USING gin(flags);
CREATE INDEX IF NOT EXISTS idx_screener_moat       ON screener_results(moat_tier);

-- signal_alerts
CREATE INDEX IF NOT EXISTS idx_alerts_fired        ON signal_alerts(fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_ticker       ON signal_alerts(ticker);
CREATE INDEX IF NOT EXISTS idx_alerts_ticker_fired ON signal_alerts(ticker, fired_at DESC);

-- exit_signals (ensure columns exist for pre-existing tables)
ALTER TABLE exit_signals ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'MEDIUM';
ALTER TABLE exit_signals ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_exit_signals_ticker   ON exit_signals(ticker);
CREATE INDEX IF NOT EXISTS idx_exit_signals_time     ON exit_signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exit_signals_severity ON exit_signals(severity);
CREATE INDEX IF NOT EXISTS idx_exit_signals_active   ON exit_signals(acknowledged) WHERE acknowledged = false;

-- wave_counts
CREATE INDEX IF NOT EXISTS idx_wave_ticker         ON wave_counts(ticker);
CREATE INDEX IF NOT EXISTS idx_wave_signal         ON wave_counts(tli_signal);
CREATE INDEX IF NOT EXISTS idx_wave_confidence     ON wave_counts(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_wave_interpreted    ON wave_counts(claude_interpreted_at);

-- backtest
CREATE INDEX IF NOT EXISTS idx_backtest_ticker     ON backtest_results(ticker);
CREATE INDEX IF NOT EXISTS idx_backtest_outcome    ON backtest_results(outcome);
CREATE INDEX IF NOT EXISTS idx_bt_summary_ticker   ON backtest_summary(ticker);
CREATE INDEX IF NOT EXISTS idx_bt_summary_winrate  ON backtest_summary(win_rate_pct DESC);

-- scan_history
CREATE INDEX IF NOT EXISTS idx_scan_history_time   ON scan_history(scanned_at DESC);

-- watchlist
CREATE INDEX IF NOT EXISTS idx_watchlist_ticker    ON watchlist(ticker);

-- institutional (Sprint 6A)
CREATE INDEX IF NOT EXISTS idx_holdings_investor   ON investor_holdings(investor_id);
CREATE INDEX IF NOT EXISTS idx_holdings_ticker     ON investor_holdings(ticker);
CREATE INDEX IF NOT EXISTS idx_holdings_quarter    ON investor_holdings(quarter);
CREATE INDEX IF NOT EXISTS idx_signals_investor    ON investor_signals(investor_id);
CREATE INDEX IF NOT EXISTS idx_signals_ticker      ON investor_signals(ticker);
CREATE INDEX IF NOT EXISTS idx_signals_quarter     ON investor_signals(quarter);
CREATE INDEX IF NOT EXISTS idx_consensus_ticker    ON consensus_signals(ticker);
CREATE INDEX IF NOT EXISTS idx_consensus_quarter   ON consensus_signals(quarter);
CREATE INDEX IF NOT EXISTS idx_consensus_score     ON consensus_signals(consensus_score DESC);

-- valuation (Sprint 6B)
CREATE INDEX IF NOT EXISTS idx_stock_valuations_ticker ON stock_valuations(ticker);
CREATE INDEX IF NOT EXISTS idx_stock_valuations_date   ON stock_valuations(computed_date DESC);

-- signal outcomes (Sprint 6B)
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_ticker ON signal_outcomes(ticker);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_date   ON signal_outcomes(signal_date DESC);


-- ══════════════════════════════════════════════════════════════════════
-- SEED DATA: 8 SUPER INVESTORS
-- ══════════════════════════════════════════════════════════════════════

INSERT INTO super_investors (name, cik, fund_name, philosophy, style_tags) VALUES
  ('Greg Abel / Berkshire Hathaway', '0001067983', 'Berkshire Hathaway Inc',
   'Long-term value, balance sheet focus, FCF generation, economic moats',
   ARRAY['value','long_term','cash_flow','dividend','moat']),

  ('David Tepper / Appaloosa', '0001656456', 'Appaloosa Management',
   'Contrarian value, distressed debt, cyclical recovery plays',
   ARRAY['value','contrarian','cyclical','distressed']),

  ('Stanley Druckenmiller / Duquesne', '0001536411', 'Duquesne Family Office',
   'Macro-driven growth, concentrated positions, momentum-aware',
   ARRAY['growth','macro','momentum','concentrated']),

  ('Chase Coleman / Tiger Global', '0001167483', 'Tiger Global Management',
   'High-growth technology, SaaS platforms, international tech',
   ARRAY['growth','technology','saas','international']),

  ('Steve Cohen / Point72', '0001603466', 'Point72 Asset Management',
   'Multi-strategy, quantitative overlay, sector specialists',
   ARRAY['multi_strategy','quantitative','sector_specialist']),

  ('Paul Tudor Jones / Tudor', '0001067839', 'Tudor Investment Corp',
   'Macro trading, risk management, trend following',
   ARRAY['macro','trading','risk_management','trend']),

  ('Philippe Laffont / Coatue', '0001535392', 'Coatue Management',
   'Technology-focused growth, AI/cloud infrastructure, growth deceleration exits',
   ARRAY['growth','technology','ai','cloud','momentum_exit']),

  ('Howard Marks / Oaktree', '0001545660', 'Oaktree Capital Management',
   'Credit/distressed, cycle awareness, margin of safety',
   ARRAY['value','credit','distressed','cycle_aware','margin_of_safety'])

ON CONFLICT (cik) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════
-- SPRINT 8: AGENTIC INTELLIGENCE SYSTEM TABLES
-- ══════════════════════════════════════════════════════════════════════

-- No external embedding dependencies. Uses metadata + PostgreSQL full-text search.


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 19: knowledge_chunks (Sprint 8)                           │
-- │  Knowledge base — chunked documents with metadata + full-text    │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type     TEXT        NOT NULL,
  source_name     TEXT        NOT NULL,
  source_date     DATE,
  chunk_text      TEXT        NOT NULL,
  chunk_index     INTEGER     NOT NULL DEFAULT 0,
  tickers_mentioned TEXT[]    DEFAULT '{}',
  investors_mentioned TEXT[]  DEFAULT '{}',
  sectors_mentioned TEXT[]    DEFAULT '{}',
  topics          TEXT[]      DEFAULT '{}',
  chunk_tsv       TSVECTOR,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 20: llm_calls (Sprint 8)                                  │
-- │  Audit trail for every LLM call in the system                    │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS llm_calls (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  task            TEXT        NOT NULL,
  model           TEXT        NOT NULL,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  elapsed_ms      INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 21: stock_analysis (Sprint 8)                             │
-- │  Complete agentic analysis output per ticker                     │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS stock_analysis (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker                TEXT        NOT NULL UNIQUE,
  signal                TEXT,
  composite_score       INTEGER,
  thesis_text           TEXT,
  thesis_json           JSONB,
  moat_analysis         JSONB,
  earnings_quality      JSONB,
  value_trap            JSONB,
  wave_analysis         JSONB,
  position_sizing       JSONB,
  valuation_analysis    JSONB,
  macro_context         JSONB,
  institutional_analysis JSONB,
  greats_comparison     JSONB,
  skills_used           TEXT[],
  analysis_elapsed_ms   INTEGER,
  analyzed_at           TIMESTAMPTZ DEFAULT NOW()
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 22: weight_adjustments (Sprint 8)                         │
-- │  Proposed scoring weight changes (pending human approval)        │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS weight_adjustments (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  weight_name     TEXT        NOT NULL,
  current_value   NUMERIC,
  proposed_value  NUMERIC,
  delta           NUMERIC,
  evidence        TEXT,
  expected_impact TEXT,
  status          TEXT        DEFAULT 'pending',
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 23: learned_principles (Sprint 8)                         │
-- │  Extracted investing principles from signal outcome analysis     │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS learned_principles (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  principle_text    TEXT        NOT NULL,
  evidence_summary  TEXT,
  confidence        NUMERIC,
  applicable_to     TEXT[]      DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);


-- ─── Auto-populate tsvector on insert/update (Sprint 8) ───

CREATE OR REPLACE FUNCTION knowledge_chunks_tsv_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.chunk_tsv := to_tsvector('english', NEW.chunk_text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_tsv ON knowledge_chunks;
CREATE TRIGGER trg_knowledge_tsv
  BEFORE INSERT OR UPDATE OF chunk_text ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION knowledge_chunks_tsv_trigger();


-- ─── Full-text search + metadata retrieval function (Sprint 8) ───

CREATE OR REPLACE FUNCTION search_knowledge(
  search_query TEXT,
  filter_ticker TEXT DEFAULT '',
  filter_topics TEXT[] DEFAULT '{}',
  filter_source_types TEXT[] DEFAULT '{}',
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id              UUID,
  source_type     TEXT,
  source_name     TEXT,
  source_date     DATE,
  chunk_text      TEXT,
  chunk_index     INTEGER,
  tickers_mentioned TEXT[],
  investors_mentioned TEXT[],
  sectors_mentioned TEXT[],
  topics          TEXT[],
  rank            FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  tsq TSQUERY;
BEGIN
  -- Build tsquery from search terms (OR-based for broad matching)
  BEGIN
    tsq := to_tsquery('english', search_query);
  EXCEPTION WHEN OTHERS THEN
    tsq := plainto_tsquery('english', search_query);
  END;

  RETURN QUERY
  SELECT
    kc.id,
    kc.source_type,
    kc.source_name,
    kc.source_date,
    kc.chunk_text,
    kc.chunk_index,
    kc.tickers_mentioned,
    kc.investors_mentioned,
    kc.sectors_mentioned,
    kc.topics,
    ts_rank(kc.chunk_tsv, tsq)::FLOAT AS rank
  FROM knowledge_chunks kc
  WHERE
    -- Full-text match OR metadata match (broad retrieval)
    (
      kc.chunk_tsv @@ tsq
      OR (filter_ticker <> '' AND kc.tickers_mentioned && ARRAY[filter_ticker])
      OR (array_length(filter_topics, 1) > 0 AND kc.topics && filter_topics)
    )
    -- Additional filters (narrow when provided)
    AND (filter_ticker = '' OR kc.tickers_mentioned && ARRAY[filter_ticker])
    AND (array_length(filter_source_types, 1) IS NULL OR kc.source_type = ANY(filter_source_types))
  ORDER BY
    -- Boost: ticker match + text match together ranks highest
    CASE WHEN filter_ticker <> '' AND kc.tickers_mentioned && ARRAY[filter_ticker] THEN 1.0 ELSE 0.0 END
    + ts_rank(kc.chunk_tsv, tsq)::FLOAT DESC
  LIMIT match_count;
END;
$$;


-- ─── Sprint 8 Indexes ───

-- knowledge_chunks: GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_knowledge_tsv ON knowledge_chunks USING gin(chunk_tsv);

-- knowledge_chunks: GIN indexes for metadata filtering
CREATE INDEX IF NOT EXISTS idx_knowledge_tickers   ON knowledge_chunks USING gin(tickers_mentioned);
CREATE INDEX IF NOT EXISTS idx_knowledge_topics    ON knowledge_chunks USING gin(topics);
CREATE INDEX IF NOT EXISTS idx_knowledge_source    ON knowledge_chunks(source_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_name      ON knowledge_chunks(source_name);

-- llm_calls
CREATE INDEX IF NOT EXISTS idx_llm_calls_task      ON llm_calls(task);
CREATE INDEX IF NOT EXISTS idx_llm_calls_time      ON llm_calls(created_at DESC);

-- stock_analysis
CREATE INDEX IF NOT EXISTS idx_stock_analysis_ticker ON stock_analysis(ticker);
CREATE INDEX IF NOT EXISTS idx_stock_analysis_signal ON stock_analysis(signal);
CREATE INDEX IF NOT EXISTS idx_stock_analysis_score  ON stock_analysis(composite_score DESC);

-- weight_adjustments
CREATE INDEX IF NOT EXISTS idx_weight_adj_status   ON weight_adjustments(status);

-- learned_principles
CREATE INDEX IF NOT EXISTS idx_principles_confidence ON learned_principles(confidence DESC);


-- ─── Sprint 8 RLS ───

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE learned_principles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read knowledge_chunks') THEN
    CREATE POLICY "Public read knowledge_chunks" ON knowledge_chunks FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read llm_calls') THEN
    CREATE POLICY "Public read llm_calls" ON llm_calls FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read stock_analysis') THEN
    CREATE POLICY "Public read stock_analysis" ON stock_analysis FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read weight_adjustments') THEN
    CREATE POLICY "Public read weight_adjustments" ON weight_adjustments FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read learned_principles') THEN
    CREATE POLICY "Public read learned_principles" ON learned_principles FOR SELECT USING (true);
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════════
-- SPRINT 9A: SAIN — SOCIAL + POLITICAL INTELLIGENCE LAYER
-- ══════════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 24: sain_sources (Sprint 9A)                              │
-- │  Registry of all tracked data sources                            │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS sain_sources (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  platform              TEXT        NOT NULL,
  handle                TEXT,
  url                   TEXT,
  api_url               TEXT,
  source_type           TEXT        NOT NULL,
  category              TEXT        NOT NULL,
  scrape_method         TEXT        NOT NULL,
  priority              TEXT        DEFAULT 'MEDIUM',
  active                BOOLEAN     DEFAULT TRUE,
  last_scraped_at       TIMESTAMPTZ,
  last_tweet_id         TEXT,
  scrape_frequency_hours INT       DEFAULT 12,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 25: sain_signals (Sprint 9A)                              │
-- │  Raw signals extracted from all sources                          │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS sain_signals (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id             UUID        REFERENCES sain_sources(id),
  ticker                TEXT        NOT NULL,
  direction             TEXT        NOT NULL,
  conviction            TEXT,
  signal_date           TIMESTAMPTZ NOT NULL,
  politician_name       TEXT,
  politician_party      TEXT,
  politician_chamber    TEXT,
  politician_committees TEXT[],
  trade_amount_range    TEXT,
  committee_sector_match BOOLEAN    DEFAULT FALSE,
  filing_delay_days     INT,
  ai_model_name         TEXT,
  thesis_summary        TEXT,
  insider_name          TEXT,
  insider_title         TEXT,
  raw_text              TEXT,
  source_url            TEXT,
  quality_score         DECIMAL(3,2) DEFAULT 0.5,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │  TABLE 26: sain_consensus (Sprint 9A)                            │
-- │  4-layer consensus per ticker                                    │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS sain_consensus (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker                  TEXT        NOT NULL,
  computed_date           DATE        NOT NULL,
  super_investor_score    INT         DEFAULT 0,
  politician_score        INT         DEFAULT 0,
  ai_model_score          INT         DEFAULT 0,
  insider_score           INT         DEFAULT 0,
  tli_score               INT         DEFAULT 0,
  total_sain_score        INT         DEFAULT 0,
  layers_aligned          INT         DEFAULT 0,
  is_full_stack_consensus BOOLEAN     DEFAULT FALSE,
  consensus_direction     TEXT,
  politician_trades       JSONB       DEFAULT '[]',
  ai_model_signals        JSONB       DEFAULT '[]',
  insider_trades          JSONB       DEFAULT '[]',
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticker, computed_date)
);


-- ─── Sprint 9A Indexes ───

CREATE INDEX IF NOT EXISTS idx_sain_signals_ticker    ON sain_signals(ticker);
CREATE INDEX IF NOT EXISTS idx_sain_signals_date      ON sain_signals(signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_sain_signals_direction ON sain_signals(direction);
CREATE INDEX IF NOT EXISTS idx_sain_consensus_ticker  ON sain_consensus(ticker);
CREATE INDEX IF NOT EXISTS idx_sain_consensus_fsc     ON sain_consensus(is_full_stack_consensus) WHERE is_full_stack_consensus = TRUE;
CREATE INDEX IF NOT EXISTS idx_sain_sources_active    ON sain_sources(active) WHERE active = TRUE;


-- ─── Sprint 9A RLS ───

ALTER TABLE sain_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sain_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sain_consensus ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read sain_sources') THEN
    CREATE POLICY "Public read sain_sources" ON sain_sources FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read sain_signals') THEN
    CREATE POLICY "Public read sain_signals" ON sain_signals FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read sain_consensus') THEN
    CREATE POLICY "Public read sain_consensus" ON sain_consensus FOR SELECT USING (true);
  END IF;
END $$;
