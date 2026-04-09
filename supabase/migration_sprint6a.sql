-- ══════════════════════════════════════════════════════════════
-- Sprint 6A — Fundamental Scoring Engine + Institutional Tracker
-- ══════════════════════════════════════════════════════════════
-- Run in the Supabase SQL Editor AFTER migration.sql.
-- Safe to re-run: uses IF NOT EXISTS throughout.
-- ══════════════════════════════════════════════════════════════


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE: super_investors                                   │
-- │  Registry of 8 tracked super investors                    │
-- └──────────────────────────────────────────────────────────┘

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


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE: investor_holdings                                 │
-- │  Quarterly 13F holdings snapshot per investor             │
-- └──────────────────────────────────────────────────────────┘

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


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE: investor_signals                                  │
-- │  Computed quarterly changes (derived from holdings diff)  │
-- └──────────────────────────────────────────────────────────┘

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


-- ┌──────────────────────────────────────────────────────────┐
-- │  TABLE: consensus_signals                                 │
-- │  Aggregated cross-investor consensus per ticker           │
-- └──────────────────────────────────────────────────────────┘

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


-- ══════════════════════════════════════════════════════════════
-- EXTEND screener_results WITH NEW SCORING COLUMNS
-- ══════════════════════════════════════════════════════════════

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


-- ══════════════════════════════════════════════════════════════
-- RLS + INDEXES FOR NEW TABLES
-- ══════════════════════════════════════════════════════════════

ALTER TABLE super_investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE consensus_signals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read super_investors') THEN
    CREATE POLICY "Public read super_investors" ON super_investors FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read investor_holdings') THEN
    CREATE POLICY "Public read investor_holdings" ON investor_holdings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read investor_signals') THEN
    CREATE POLICY "Public read investor_signals" ON investor_signals FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read consensus_signals') THEN
    CREATE POLICY "Public read consensus_signals" ON consensus_signals FOR SELECT USING (true);
  END IF;
END $$;

-- Institutional indexes
CREATE INDEX IF NOT EXISTS idx_holdings_investor   ON investor_holdings(investor_id);
CREATE INDEX IF NOT EXISTS idx_holdings_ticker     ON investor_holdings(ticker);
CREATE INDEX IF NOT EXISTS idx_holdings_quarter    ON investor_holdings(quarter);
CREATE INDEX IF NOT EXISTS idx_signals_investor    ON investor_signals(investor_id);
CREATE INDEX IF NOT EXISTS idx_signals_ticker      ON investor_signals(ticker);
CREATE INDEX IF NOT EXISTS idx_signals_quarter     ON investor_signals(quarter);
CREATE INDEX IF NOT EXISTS idx_consensus_ticker    ON consensus_signals(ticker);
CREATE INDEX IF NOT EXISTS idx_consensus_quarter   ON consensus_signals(quarter);
CREATE INDEX IF NOT EXISTS idx_consensus_score     ON consensus_signals(consensus_score DESC);

-- Screener results new column indexes
CREATE INDEX IF NOT EXISTS idx_screener_flags      ON screener_results USING gin(flags);
CREATE INDEX IF NOT EXISTS idx_screener_moat       ON screener_results(moat_tier);


-- ══════════════════════════════════════════════════════════════
-- SEED: 8 SUPER INVESTORS
-- ══════════════════════════════════════════════════════════════

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
