/**
 * Knowledge Base Retrieval Service — Sprint 8
 *
 * Semantic search over the knowledge_chunks table using pgvector.
 * Supports metadata filtering by ticker, topic, and source type.
 */

const { embed } = require('./embeddings');
const supabase = require('./supabase');

/**
 * Retrieve relevant knowledge chunks using vector similarity search.
 */
async function retrieve({
  query,
  ticker = null,
  topics = null,
  sourceTypes = null,
  limit = 10,
  similarityThreshold = 0.7,
}) {
  const queryEmbedding = await embed(query);

  // Use Supabase RPC for vector similarity search
  let { data, error } = await supabase.rpc('match_knowledge', {
    query_embedding: queryEmbedding,
    match_threshold: similarityThreshold,
    match_count: limit * 3, // fetch extra to allow for post-filtering
  });

  if (error) {
    console.error('[Knowledge] Retrieval error:', error.message);
    return [];
  }

  if (!data) return [];

  // Post-filter by metadata
  if (ticker) {
    data = data.filter(d => d.tickers_mentioned?.includes(ticker));
  }
  if (topics && topics.length > 0) {
    data = data.filter(d =>
      d.topics?.some(t => topics.includes(t))
    );
  }
  if (sourceTypes && sourceTypes.length > 0) {
    data = data.filter(d => sourceTypes.includes(d.source_type));
  }

  return data.slice(0, limit);
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
