-- ═══════════════════════════════════════════════════════════════
-- Migration 005: email_log
-- ═══════════════════════════════════════════════════════════════
-- Audit trail for every transactional email attempted.
-- Rows are never deleted; failures are retained for debugging.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS email_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  type          TEXT        NOT NULL,
  subject       TEXT,
  status        TEXT        NOT NULL DEFAULT 'sent',
  provider      TEXT        DEFAULT 'resend',
  provider_id   TEXT,
  error         TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_log_type_ck CHECK (
    type IN ('welcome', 'launch', 'digest', 'alert')
  ),
  CONSTRAINT email_log_status_ck CHECK (
    status IN ('sent', 'failed', 'bounced', 'queued')
  )
);

-- Query patterns:
--   - per-recipient history                 → (email, sent_at DESC)
--   - delivery health dashboard             → (type, status)
--   - time-range failure audit              → (status, sent_at DESC)
CREATE INDEX IF NOT EXISTS idx_email_log_email_sent
  ON email_log (email, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_log_type_status
  ON email_log (type, status);

CREATE INDEX IF NOT EXISTS idx_email_log_status_sent
  ON email_log (status, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_log_sent
  ON email_log (sent_at DESC);

COMMENT ON TABLE email_log IS 'Every outbound transactional email. Never delete rows.';
