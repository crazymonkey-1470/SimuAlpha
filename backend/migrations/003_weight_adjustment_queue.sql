-- ═══════════════════════════════════════════════════════════════
-- Migration 003: weight_adjustment_queue
-- ═══════════════════════════════════════════════════════════════
-- Proposed factor weight changes awaiting human approval. Self-
-- referencing FK lets us trace rollback lineage.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS weight_adjustment_queue (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  factor              TEXT        NOT NULL,
  current_weight      NUMERIC(10,6) NOT NULL,
  proposed_weight     NUMERIC(10,6) NOT NULL,
  change_pct          NUMERIC(10,4) NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'PENDING_APPROVAL',
  basis_json          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  proposed_by         TEXT        DEFAULT 'learning_cycle_v2',
  approved_by         TEXT,
  rejected_reason     TEXT,
  rolled_back_from_id UUID        REFERENCES weight_adjustment_queue(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at         TIMESTAMPTZ,
  applied_at          TIMESTAMPTZ,
  rejected_at         TIMESTAMPTZ,
  rolled_back_at      TIMESTAMPTZ,
  CONSTRAINT weight_adjustment_status_ck CHECK (
    status IN (
      'PENDING_APPROVAL',
      'APPROVED',
      'APPLIED',
      'REJECTED',
      'ROLLED_BACK'
    )
  ),
  CONSTRAINT weight_adjustment_change_bounds_ck CHECK (
    change_pct BETWEEN -100 AND 100
  )
);

-- Query patterns in tier_routes.js:
--   - pending queue listing                     → (status, created_at DESC)
--   - per-factor history                        → (factor, created_at DESC)
--   - approval trace                            → (rolled_back_from_id)
CREATE INDEX IF NOT EXISTS idx_weight_queue_status_created
  ON weight_adjustment_queue (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_weight_queue_factor_created
  ON weight_adjustment_queue (factor, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_weight_queue_rollback_parent
  ON weight_adjustment_queue (rolled_back_from_id)
  WHERE rolled_back_from_id IS NOT NULL;

COMMENT ON TABLE  weight_adjustment_queue IS 'Human-in-the-loop approval queue for factor weight changes.';
COMMENT ON COLUMN weight_adjustment_queue.rolled_back_from_id IS
  'Self-FK: points to the adjustment this row is rolling back. SET NULL on parent delete preserves audit trail.';
COMMENT ON COLUMN weight_adjustment_queue.basis_json IS
  'Evidence payload: observed_accuracy, baseline_accuracy, sample_size, successes, signal_outcome_ids[].';
