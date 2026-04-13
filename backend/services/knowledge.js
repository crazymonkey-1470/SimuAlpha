/**
 * Knowledge Base Retrieval Service — Sprint 8
 *
 * Metadata filtering + PostgreSQL full-text search over knowledge_chunks.
 * Zero external dependencies — just Supabase.
 */

const supabase = require('./supabase');
const log = require('./logger').child({ module: 'knowledge' });

/**
 * Retrieve relevant knowledge chunks using metadata filters + full-text search.
 *
 * Strategy:
 *   1. Build a Supabase query with array overlap filters (tickers, topics, etc.)
 *   2. Use the search_knowledge RPC for full-text ranking when a text query is provided
 *   3. Fall back to metadata-only filtering if RPC is not available
 */
async function retrieve({
  query,
  ticker = null,
  topics = null,
  sourceTypes = null,
  limit = 10,
}) {
  // Try the full-text search RPC first (metadata + ts_rank)
  const searchTerms = buildSearchTerms(query, ticker);

  if (searchTerms) {
    const { data, error } = await supabase.rpc('search_knowledge', {
      search_query: searchTerms,
      filter_ticker: ticker || '',
      filter_topics: topics || [],
      filter_source_types: sourceTypes || [],
      match_count: limit,
    });

    if (!error && data && data.length > 0) {
      return data;
    }

    // If RPC fails (e.g., function doesn't exist yet), fall back to direct query
    if (error) {
      log.info({ err: error }, 'RPC not available, falling back to metadata query');
    }
  }

  // Fallback: direct metadata filtering via Supabase client
  let q = supabase
    .from('knowledge_chunks')
    .select('id, source_type, source_name, source_date, chunk_text, chunk_index, tickers_mentioned, investors_mentioned, sectors_mentioned, topics');

  if (sourceTypes && sourceTypes.length > 0) {
    q = q.in('source_type', sourceTypes);
  }

  // Supabase JS doesn't support && (array overlap) directly,
  // so we filter by ticker using contains if provided
  if (ticker) {
    q = q.contains('tickers_mentioned', [ticker]);
  }

  if (topics && topics.length > 0) {
    q = q.overlaps('topics', topics);
  }

  q = q.order('created_at', { ascending: false }).limit(limit * 3);

  const { data, error } = await q;

  if (error) {
    log.error({ err: error }, 'Retrieval error');
    return [];
  }

  if (!data || data.length === 0) {
    // If metadata filtering returned nothing, broaden: fetch recent chunks
    const { data: fallback } = await supabase
      .from('knowledge_chunks')
      .select('id, source_type, source_name, source_date, chunk_text, chunk_index, tickers_mentioned, investors_mentioned, sectors_mentioned, topics')
      .order('created_at', { ascending: false })
      .limit(limit);
    return fallback || [];
  }

  return data.slice(0, limit);
}

/**
 * Build a PostgreSQL tsquery-compatible search string from the query and ticker.
 */
function buildSearchTerms(query, ticker) {
  if (!query) return null;

  // Extract meaningful words (skip very short ones)
  const words = query
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 10);

  if (ticker) words.unshift(ticker);

  if (words.length === 0) return null;

  // Join with | (OR) for broader matching
  return words.join(' | ');
}

/**
 * Get knowledge base statistics.
 */
async function getStats() {
  const { count: totalChunks } = await supabase
    .from('knowledge_chunks')
    .select('*', { count: 'exact', head: true });

  const { data: sources } = await supabase
    .from('knowledge_chunks')
    .select('source_type, source_name')
    .order('created_at', { ascending: false });

  const sourceTypes = {};
  const sourceNames = new Set();
  for (const s of (sources || [])) {
    sourceTypes[s.source_type] = (sourceTypes[s.source_type] || 0) + 1;
    sourceNames.add(s.source_name);
  }

  return {
    total_chunks: totalChunks || 0,
    unique_documents: sourceNames.size,
    by_type: sourceTypes,
  };
}

module.exports = { retrieve, getStats };
