-- ═══════════════════════════════════════════════════════
-- Sprint 10B — Valuation Calibration + Lynch Classification
-- ═══════════════════════════════════════════════════════

-- stock_valuations: DCF exclusion, method agreement, total return, maturity
ALTER TABLE stock_valuations ADD COLUMN IF NOT EXISTS dcf_included BOOLEAN;
ALTER TABLE stock_valuations ADD COLUMN IF NOT EXISTS dcf_exclusion_reason TEXT;
ALTER TABLE stock_valuations ADD COLUMN IF NOT EXISTS method_agreement TEXT; -- HIGH/MEDIUM/LOW
ALTER TABLE stock_valuations ADD COLUMN IF NOT EXISTS method_std_dev DECIMAL(6,2);
ALTER TABLE stock_valuations ADD COLUMN IF NOT EXISTS methods_used TEXT[];
ALTER TABLE stock_valuations ADD COLUMN IF NOT EXISTS total_return DECIMAL(6,2);
ALTER TABLE stock_valuations ADD COLUMN IF NOT EXISTS is_income_play BOOLEAN;
ALTER TABLE stock_valuations ADD COLUMN IF NOT EXISTS maturity_profile TEXT;

-- screener_results: Lynch classification, kill thesis, MoS, compression, rating
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS lynch_category TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS lynch_hold_period TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS lynch_sell_trigger TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS peg_ratio DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS kill_thesis_flags TEXT[];
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS kill_thesis_count INTEGER DEFAULT 0;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS multiple_compression_signal TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS multiple_compression_pct DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS margin_of_safety DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS mos_recommendation TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS tli_rating_v2 TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS dcf_included BOOLEAN;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS dcf_exclusion_reason TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS method_agreement TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS total_return DECIMAL(6,2);
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS is_income_play BOOLEAN;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS maturity_profile TEXT;

-- stock_analysis: Position Action Card, classification data
ALTER TABLE stock_analysis ADD COLUMN IF NOT EXISTS position_card JSONB;
ALTER TABLE stock_analysis ADD COLUMN IF NOT EXISTS lynch_classification JSONB;
ALTER TABLE stock_analysis ADD COLUMN IF NOT EXISTS rating TEXT;
ALTER TABLE stock_analysis ADD COLUMN IF NOT EXISTS kill_thesis_flags TEXT[];
ALTER TABLE stock_analysis ADD COLUMN IF NOT EXISTS margin_of_safety DECIMAL(6,2);
ALTER TABLE stock_analysis ADD COLUMN IF NOT EXISTS peg_ratio DECIMAL(6,2);
ALTER TABLE stock_analysis ADD COLUMN IF NOT EXISTS multiple_compression JSONB;
ALTER TABLE stock_analysis ADD COLUMN IF NOT EXISTS tranche_recommendation JSONB;
ALTER TABLE stock_analysis ADD COLUMN IF NOT EXISTS gate_result JSONB;

-- Indexes for new filterable columns
CREATE INDEX IF NOT EXISTS idx_screener_lynch_category ON screener_results(lynch_category);
CREATE INDEX IF NOT EXISTS idx_screener_kill_thesis_count ON screener_results(kill_thesis_count);
CREATE INDEX IF NOT EXISTS idx_screener_margin_of_safety ON screener_results(margin_of_safety);
CREATE INDEX IF NOT EXISTS idx_screener_method_agreement ON screener_results(method_agreement);
CREATE INDEX IF NOT EXISTS idx_screener_tli_rating_v2 ON screener_results(tli_rating_v2);
CREATE INDEX IF NOT EXISTS idx_screener_multiple_compression ON screener_results(multiple_compression_signal);
