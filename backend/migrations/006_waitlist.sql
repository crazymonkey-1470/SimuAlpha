-- ═══════════════════════════════════════════════════════════════
-- Migration 006: waitlist
-- ═══════════════════════════════════════════════════════════════
-- Email addresses collected from the landing page signup form.
-- Unique on lower-cased email to prevent duplicate signups.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS waitlist (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  email_lower   TEXT        GENERATED ALWAYS AS (LOWER(email)) STORED,
  source        TEXT        DEFAULT 'landing',
  referrer      TEXT,
  ip_hash       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at  TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  CONSTRAINT waitlist_email_format_ck CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')
);

-- Case-insensitive uniqueness on the generated column.
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_email_lower
  ON waitlist (email_lower);

-- Query patterns:
--   - count endpoint                   → (created_at)  cheap count scan
--   - conversion funnel                → (source, created_at DESC)
--   - campaign launch iteration        → (converted_at NULLS FIRST)
CREATE INDEX IF NOT EXISTS idx_waitlist_created
  ON waitlist (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_waitlist_source_created
  ON waitlist (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_waitlist_not_converted
  ON waitlist (created_at DESC) WHERE converted_at IS NULL AND unsubscribed_at IS NULL;

COMMENT ON TABLE  waitlist IS 'Landing-page email signups. email_lower enforces case-insensitive uniqueness.';
COMMENT ON COLUMN waitlist.ip_hash IS 'Hashed IP for abuse detection; never store raw IP.';
