-- ============================================================================
-- SimuAlpha — Distress-Risk Intelligence Platform
-- Supabase Schema Migration
-- ============================================================================
--
-- INSTRUCTIONS:
-- 1. Paste this into the Supabase SQL Editor
-- 2. Review the DROP TABLE candidates at the bottom before uncommenting
-- 3. Run the migration
--
-- This creates the new distress analysis schema while preserving users/auth.
-- ============================================================================

-- ── Distress Reports ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS distress_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker VARCHAR(20) NOT NULL,
    company_name VARCHAR(256) NOT NULL,
    sector VARCHAR(128),
    industry VARCHAR(256),

    -- Core assessment
    distress_rating VARCHAR(20) NOT NULL,  -- Low / Moderate / High / Severe
    distress_score FLOAT NOT NULL,          -- 0-100 composite score
    executive_summary TEXT NOT NULL,

    -- Structured analysis (JSONB arrays)
    why_safe JSONB DEFAULT '[]'::jsonb,
    key_risks JSONB DEFAULT '[]'::jsonb,
    stabilizing_factors JSONB DEFAULT '[]'::jsonb,
    what_to_watch JSONB DEFAULT '[]'::jsonb,

    -- Narrative sections
    liquidity_analysis TEXT,
    leverage_analysis TEXT,
    profitability_analysis TEXT,
    cashflow_analysis TEXT,
    interest_coverage_analysis TEXT,
    dilution_risk_analysis TEXT,
    long_term_trend_analysis TEXT,
    hold_context TEXT,
    analyst_notes TEXT,

    -- Source data
    source_period_end VARCHAR(32),
    raw_metrics JSONB,
    raw_financials JSONB,

    -- Metadata
    report_version VARCHAR(32) NOT NULL DEFAULT 'v1',
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_ticker_version UNIQUE (ticker, report_version)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_distress_reports_ticker ON distress_reports(ticker);
CREATE INDEX IF NOT EXISTS ix_distress_reports_rating ON distress_reports(distress_rating);
CREATE INDEX IF NOT EXISTS ix_distress_reports_generated ON distress_reports(generated_at DESC);
CREATE INDEX IF NOT EXISTS ix_distress_reports_status ON distress_reports(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_distress_reports_updated_at ON distress_reports;
CREATE TRIGGER update_distress_reports_updated_at
    BEFORE UPDATE ON distress_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ── Report History (snapshots for trend tracking) ────────────────────────

CREATE TABLE IF NOT EXISTS report_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES distress_reports(id) ON DELETE CASCADE,
    ticker VARCHAR(20) NOT NULL,
    snapshot_date DATE NOT NULL,
    distress_rating VARCHAR(20) NOT NULL,
    distress_score FLOAT NOT NULL,
    raw_metrics JSONB,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_report_history_report_id ON report_history(report_id);
CREATE INDEX IF NOT EXISTS ix_report_history_ticker ON report_history(ticker);
CREATE INDEX IF NOT EXISTS ix_report_history_snapshot ON report_history(snapshot_date);


-- ── Watchlists ───────────────────────────────────────────────────────────

-- Note: If watchlists table already exists from old schema, this will be skipped.
-- The new schema is simpler — no workspace dependency.

CREATE TABLE IF NOT EXISTS watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_watchlists_user_id ON watchlists(user_id);

CREATE TABLE IF NOT EXISTS watchlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    ticker VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_watchlist_ticker UNIQUE (watchlist_id, ticker)
);

CREATE INDEX IF NOT EXISTS ix_watchlist_items_watchlist_id ON watchlist_items(watchlist_id);


-- ============================================================================
-- OLD TABLE CLEANUP CANDIDATES
-- ============================================================================
-- The following tables were part of the old SimuAlpha market simulation product.
-- They are NO LONGER NEEDED for the distress-risk intelligence product.
--
-- REVIEW CAREFULLY before uncommenting. Only drop if you are certain
-- these tables are not used by any other service.
-- ============================================================================

-- DROP TABLE IF EXISTS signal_summaries CASCADE;
-- DROP TABLE IF EXISTS scenario_branches CASCADE;
-- DROP TABLE IF EXISTS actor_states CASCADE;
-- DROP TABLE IF EXISTS regime_snapshots CASCADE;
-- DROP TABLE IF EXISTS simulation_runs CASCADE;
-- DROP TABLE IF EXISTS replay_frames CASCADE;
-- DROP TABLE IF EXISTS replay_runs CASCADE;
-- DROP TABLE IF EXISTS calibration_runs CASCADE;
-- DROP TABLE IF EXISTS system_status CASCADE;
-- DROP TABLE IF EXISTS saved_views CASCADE;
-- DROP TABLE IF EXISTS replay_bookmarks CASCADE;
-- DROP TABLE IF EXISTS user_preferences CASCADE;
-- DROP TABLE IF EXISTS workspace_memberships CASCADE;
-- DROP TABLE IF EXISTS workspaces CASCADE;

-- ============================================================================
-- TABLES TO KEEP (shared / still relevant)
-- ============================================================================
-- users              — User accounts (auth)
-- refresh_tokens     — JWT refresh token management
-- watchlists         — Now used for distress watchlists
-- watchlist_items    — Watchlist ticker items
-- distress_reports   — NEW: Core distress analysis reports
-- report_history     — NEW: Historical snapshots for trend tracking
