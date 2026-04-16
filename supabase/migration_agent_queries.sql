-- agent_queries: log every ALPHA → SimuAlpha AI brain interaction
CREATE TABLE IF NOT EXISTS agent_queries (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prompt        TEXT NOT NULL,
  ticker        TEXT,
  mode          TEXT,
  response_json JSONB,
  error         TEXT,
  duration_ms   INT
);

-- Fast lookups by ticker and recency
CREATE INDEX IF NOT EXISTS agent_queries_ticker_idx    ON agent_queries (ticker);
CREATE INDEX IF NOT EXISTS agent_queries_created_at_idx ON agent_queries (created_at DESC);
