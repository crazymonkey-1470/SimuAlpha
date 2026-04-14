-- ══════════════════════════════════════════════════════════════════════
-- SimuAlpha Auth Layer — API Keys + Rate Limiting
-- Run in Supabase SQL Editor BEFORE deploying auth middleware
-- ══════════════════════════════════════════════════════════════════════

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL UNIQUE,           -- SHA-256 of actual key
  key_prefix VARCHAR(8) NOT NULL,          -- First 8 chars for identification
  name VARCHAR(255) NOT NULL,              -- "ALPHA Agent", "Andrew Admin", etc.
  scopes TEXT[] NOT NULL DEFAULT '{}',     -- {"read", "write", "admin", "agent"}
  rate_limit_per_minute INT DEFAULT 60,
  rate_limit_per_day INT DEFAULT 10000,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,                  -- NULL = never expires
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;

-- Rate limiting tracking
CREATE TABLE IF NOT EXISTS api_rate_limits (
  key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_type VARCHAR(10) NOT NULL,        -- "minute" or "day"
  request_count INT DEFAULT 1,
  PRIMARY KEY (key_id, window_start, window_type)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup ON api_rate_limits(window_start);

-- RLS — service role only
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role only api_keys') THEN
    CREATE POLICY "Service role only api_keys" ON api_keys FOR ALL USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role only api_rate_limits') THEN
    CREATE POLICY "Service role only api_rate_limits" ON api_rate_limits FOR ALL USING (false);
  END IF;
END $$;
