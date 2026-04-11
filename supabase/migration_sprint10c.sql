-- ═══════════════════════════════════════════════════════
-- Sprint 10C — Agentic Learning Integration
-- ═══════════════════════════════════════════════════════

-- Dynamic scoring config table — v3 scorer reads weights at runtime
CREATE TABLE IF NOT EXISTS scoring_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT NOT NULL UNIQUE,
  config_value DECIMAL(8,2) NOT NULL,
  description TEXT,
  layer TEXT, -- FUNDAMENTAL | WAVE | CONFLUENCE | SCREEN | SAIN | RISK | MACRO
  last_modified TIMESTAMPTZ DEFAULT NOW(),
  modified_by TEXT DEFAULT 'initial'
);

CREATE INDEX IF NOT EXISTS idx_scoring_config_key ON scoring_config(config_key);
CREATE INDEX IF NOT EXISTS idx_scoring_config_layer ON scoring_config(layer);

-- Seed with v3 defaults
INSERT INTO scoring_config (config_key, config_value, description, layer) VALUES
  -- Fundamental layer (0-30)
  ('fundamental_revenue_growth', 5, 'Points for revenue growth accelerating', 'FUNDAMENTAL'),
  ('fundamental_gross_margin', 5, 'Points for gross margin expanding', 'FUNDAMENTAL'),
  ('fundamental_fcf', 5, 'Points for positive FCF', 'FUNDAMENTAL'),
  ('fundamental_balance_sheet', 5, 'Points for low debt/strong cash', 'FUNDAMENTAL'),
  ('fundamental_tam', 5, 'Points for large TAM remaining', 'FUNDAMENTAL'),
  ('fundamental_moat', 5, 'Points for competitive moat', 'FUNDAMENTAL'),
  -- Confluence layer (0-40)
  ('confluence_previous_low', 3, 'Points for price at previous low', 'CONFLUENCE'),
  ('confluence_round_number', 2, 'Points for round number support', 'CONFLUENCE'),
  ('confluence_50ma', 3, 'Points for 50-day MA support', 'CONFLUENCE'),
  ('confluence_200ma', 4, 'Points for 200-day MA support', 'CONFLUENCE'),
  ('confluence_200wma', 5, 'Points for 200-week MA support', 'CONFLUENCE'),
  ('confluence_fib_0382', 3, 'Points for 0.382 Fib level', 'CONFLUENCE'),
  ('confluence_fib_050', 4, 'Points for 0.5 Fib level', 'CONFLUENCE'),
  ('confluence_fib_0618', 5, 'Points for 0.618 Fib level', 'CONFLUENCE'),
  ('confluence_fib_0786', 4, 'Points for 0.786 Fib level', 'CONFLUENCE'),
  ('confluence_wave1_origin', 5, 'Points for Wave 1 origin support', 'CONFLUENCE'),
  ('confluence_zone_bonus', 15, 'Bonus for 200WMA + 0.618 Fib within 3%', 'CONFLUENCE'),
  ('generational_buy_bonus', 20, 'Bonus for 0.786 + W1 origin + 200MMA within 15%', 'CONFLUENCE'),
  -- SAIN layer
  ('sain_full_stack', 15, 'Bonus for Full Stack Consensus', 'SAIN'),
  ('sain_three_layer', 8, 'Bonus for 3-layer alignment', 'SAIN'),
  ('sain_politician_conviction', 5, 'Bonus for committee-match politician trades', 'SAIN'),
  ('sain_ai_consensus', 4, 'Bonus for 3+ AI models agreeing', 'SAIN'),
  -- Risk layer
  ('downtrend_threshold', 4, 'Score at which buy signals suppressed', 'RISK'),
  ('chase_filter_pct', 20, 'Max % above entry before signal expires', 'RISK'),
  ('earnings_blackout_days', 14, 'Days before earnings to suppress new buys', 'RISK'),
  ('sentiment_boost', 5, 'Points added/subtracted for extreme sentiment', 'RISK')
ON CONFLICT (config_key) DO NOTHING;

-- Signal outcomes: extend for v3 breakdown + position_card snapshot
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS position_card JSONB;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS wave_target_hit BOOLEAN;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS v3_fundamental_score DECIMAL(6,2);
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS v3_wave_score DECIMAL(6,2);
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS v3_confluence_score DECIMAL(6,2);
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS v3_sain_bonus DECIMAL(6,2);
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS v3_lynch_score INTEGER;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS v3_buffett_score INTEGER;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS v3_health_red_flags INTEGER;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS v3_downtrend_score INTEGER;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS v3_badges TEXT[];

-- Weight adjustments: store evidence + layer for approved memos
ALTER TABLE weight_adjustments ADD COLUMN IF NOT EXISTS layer TEXT;
ALTER TABLE weight_adjustments ADD COLUMN IF NOT EXISTS sample_size INTEGER;
ALTER TABLE weight_adjustments ADD COLUMN IF NOT EXISTS win_rate DECIMAL(5,2);
ALTER TABLE weight_adjustments ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
ALTER TABLE weight_adjustments ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE weight_adjustments ADD COLUMN IF NOT EXISTS knowledge_memo_id UUID;

-- Learned principles: store v3 layer mapping + approval flow
ALTER TABLE learned_principles ADD COLUMN IF NOT EXISTS layer TEXT;
ALTER TABLE learned_principles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PROPOSED';
ALTER TABLE learned_principles ADD COLUMN IF NOT EXISTS proposed_points DECIMAL(6,2);
ALTER TABLE learned_principles ADD COLUMN IF NOT EXISTS condition TEXT;
ALTER TABLE learned_principles ADD COLUMN IF NOT EXISTS conflicts_with TEXT;
ALTER TABLE learned_principles ADD COLUMN IF NOT EXISTS source_document TEXT;
ALTER TABLE learned_principles ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE learned_principles ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_learned_principles_status ON learned_principles(status);
CREATE INDEX IF NOT EXISTS idx_learned_principles_layer ON learned_principles(layer);
CREATE INDEX IF NOT EXISTS idx_weight_adjustments_layer ON weight_adjustments(layer);
CREATE INDEX IF NOT EXISTS idx_weight_adjustments_status ON weight_adjustments(status);
