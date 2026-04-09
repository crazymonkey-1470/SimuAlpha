-- ═══════════════════════════════════════════════════════════════
-- Sprint 6B Migration — Market Context Layer + Valuations + Signal Tracking
-- ═══════════════════════════════════════════════════════════════

-- 1. Macro Context table
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

-- RLS for macro_context
ALTER TABLE macro_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "macro_context_read" ON macro_context FOR SELECT USING (true);

-- 2. Stock Valuations table
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

ALTER TABLE stock_valuations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_valuations_read" ON stock_valuations FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_stock_valuations_ticker ON stock_valuations(ticker);
CREATE INDEX IF NOT EXISTS idx_stock_valuations_date ON stock_valuations(computed_date DESC);

-- 3. Signal Outcomes table (self-improving foundation)
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

ALTER TABLE signal_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signal_outcomes_read" ON signal_outcomes FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_signal_outcomes_ticker ON signal_outcomes(ticker);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_date ON signal_outcomes(signal_date DESC);

-- 4. Scoring Accuracy table
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

ALTER TABLE scoring_accuracy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scoring_accuracy_read" ON scoring_accuracy FOR SELECT USING (true);

-- 5. Add valuation columns to screener_results
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS valuation_rating TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS avg_price_target DECIMAL(10,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS avg_upside_pct DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS dcf_price_target DECIMAL(10,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS ev_sales_price_target DECIMAL(10,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS ev_ebitda_price_target DECIMAL(10,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS wacc_risk_tier TEXT;
