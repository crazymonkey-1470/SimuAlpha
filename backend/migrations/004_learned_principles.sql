-- ═══════════════════════════════════════════════════════════════
-- Migration 004: learned_principles
-- ═══════════════════════════════════════════════════════════════
-- Accumulated insights the system has learned. Served by
-- GET /api/tier/learning/principles.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS learned_principles (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  principle        TEXT        NOT NULL,
  sample_count     INTEGER     NOT NULL CHECK (sample_count >= 0),
  confidence       NUMERIC(5,2) NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  factor           TEXT,
  source_cycle_id  UUID,
  discovered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at    TIMESTAMPTZ,
  active           BOOLEAN     GENERATED ALWAYS AS (superseded_at IS NULL) STORED
);

-- A principle is uniquely identified by its text (we supersede rather than duplicate).
CREATE UNIQUE INDEX IF NOT EXISTS uq_learned_principles_text
  ON learned_principles (principle);

-- Public endpoint filters to active and orders by most recent.
CREATE INDEX IF NOT EXISTS idx_learned_principles_active_discovered
  ON learned_principles (discovered_at DESC) WHERE superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_learned_principles_factor
  ON learned_principles (factor) WHERE factor IS NOT NULL;

COMMENT ON TABLE  learned_principles IS 'Insights surfaced by the learning cycle.';
COMMENT ON COLUMN learned_principles.active IS
  'Generated: TRUE while not superseded. Keep history by never deleting rows.';
