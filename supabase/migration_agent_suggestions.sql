-- ═══════════════════════════════════════════════════════
-- Agent Self-Improvement Suggestions
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_type TEXT NOT NULL,
  -- 'MISSING_FEATURE', 'WEIGHT_ADJUSTMENT', 'DATA_GAP', 'BUG_FIX', 'NEW_SKILL'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  claude_code_prompt TEXT,  -- The EXACT prompt to paste into Claude Code
  evidence TEXT,            -- Why the agent thinks this is needed
  priority TEXT DEFAULT 'MEDIUM',  -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  status TEXT DEFAULT 'PENDING',   -- 'PENDING', 'APPROVED', 'IMPLEMENTED', 'REJECTED'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_suggestions_status ON agent_suggestions(status);
ALTER TABLE agent_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read agent_suggestions" ON agent_suggestions FOR SELECT USING (true);
