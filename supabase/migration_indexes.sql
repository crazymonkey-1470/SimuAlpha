-- Performance indexes for SimuAlpha
-- Run once to add covering indexes for common query patterns.

-- Screener: sorted by total_score DESC (dashboard, screener table)
CREATE INDEX IF NOT EXISTS idx_screener_total_score ON screener_results(total_score DESC);

-- Screener: filter by signal type
CREATE INDEX IF NOT EXISTS idx_screener_signal ON screener_results(signal);

-- Screener: search by ticker and company name
CREATE INDEX IF NOT EXISTS idx_screener_ticker ON screener_results(ticker);
CREATE INDEX IF NOT EXISTS idx_screener_company_name ON screener_results USING gin(company_name gin_trgm_ops);

-- Screener: filter by sector
CREATE INDEX IF NOT EXISTS idx_screener_sector ON screener_results(sector);

-- Screener: sort by updated_at (rescore-batch)
CREATE INDEX IF NOT EXISTS idx_screener_updated_at ON screener_results(updated_at ASC);

-- Stock analysis: lookup by ticker
CREATE INDEX IF NOT EXISTS idx_analysis_ticker ON stock_analysis(ticker);

-- Agent activity: sort by created_at, filter by type
CREATE INDEX IF NOT EXISTS idx_activity_created ON agent_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON agent_activity(activity_type);

-- SAIN signals: covered by existing indexes but add composite
CREATE INDEX IF NOT EXISTS idx_sain_signals_source_ticker ON sain_signals(source_id, ticker, signal_date);

-- SAIN consensus: lookup by ticker and date
CREATE INDEX IF NOT EXISTS idx_sain_consensus_ticker ON sain_consensus(ticker, computed_date DESC);

-- Signal history: ticker + date for score trend
CREATE INDEX IF NOT EXISTS idx_signal_history_ticker ON signal_history(ticker, fired_at DESC);

-- Knowledge chunks: source type lookup
CREATE INDEX IF NOT EXISTS idx_knowledge_source_type ON knowledge_chunks(source_type);

-- Consensus signals: score sort
CREATE INDEX IF NOT EXISTS idx_consensus_score ON consensus_signals(consensus_score DESC);

-- Investor holdings: by investor + quarter
CREATE INDEX IF NOT EXISTS idx_holdings_investor ON investor_holdings(investor_id, quarter);

-- Macro context: date lookup
CREATE INDEX IF NOT EXISTS idx_macro_date ON macro_context(date DESC);
