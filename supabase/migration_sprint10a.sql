-- Sprint 10A: Scoring Engine Restructure — v3 columns
-- Add new columns for v3 scoring breakdown to screener_results

ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS scoring_version TEXT DEFAULT 'v2';
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS fundamental_score_v3 INT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS wave_position_score INT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS confluence_score INT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS sain_bonus INT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS sentiment_adj INT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS lynch_score INT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS buffett_score INT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS dual_screen_pass BOOLEAN;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS health_red_flags INT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS downtrend_score INT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS downtrend_suppressed BOOLEAN DEFAULT FALSE;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS wave_position TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS position_action TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS badges TEXT[];
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS risk_filters_pass BOOLEAN;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS risk_filter_reason TEXT;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS support_confirmed BOOLEAN;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS disqualified BOOLEAN DEFAULT FALSE;
ALTER TABLE screener_results ADD COLUMN IF NOT EXISTS disqualified_reasons TEXT[];
