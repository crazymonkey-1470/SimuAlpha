/**
 * Document Ingestion Pipeline — Sprint 8
 *
 * Chunks text, extracts metadata via LLM, embeds, and stores in knowledge_chunks.
 */

const { completeJSON } = require('./llm');
const { embed } = require('./embeddings');
const supabase = require('./supabase');

const METADATA_EXTRACTION_PROMPT = `You are a financial document analyzer for SimuAlpha, a stock discovery platform.

Extract metadata from this text chunk. Return JSON:
{
  "tickers": ["AAPL", "MSFT"],
  "investors": ["Berkshire", "Druckenmiller"],
  "sectors": ["Healthcare", "Energy"],
  "topics": []
}

Valid topics (pick all that apply):
- "elliott_wave" - "position_sizing" - "valuation" - "dividend" - "moat"
- "fcf" - "balance_sheet" - "revenue_growth" - "earnings_quality"
- "institutional" - "macro" - "carry_trade" - "fx_risk" - "geopolitical"
- "ai_theme" - "emerging_markets" - "sector_rotation" - "defensive"
- "value_trap" - "exit_signal" - "market_cycle" - "graham_principle"
- "technical_analysis"

Return ONLY JSON. No explanation.`;

/**
 * Ingest a document: chunk, extract metadata, embed, store.
 */
async function ingestDocument({ text, sourceName, sourceType, sourceDate }) {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot ingest empty document');
  }

  console.log(`[Ingest] Processing "${sourceName}" (${sourceType})...`);

  // Step 1: Chunk the document
  const chunks = chunkText(text, 600, 100);
  console.log(`[Ingest] Split into ${chunks.length} chunks`);

  let stored = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      // Step 2: Extract metadata via LLM
      const metadata = await completeJSON({
        task: 'DOCUMENT_INGEST',
        systemPrompt: METADATA_EXTRACTION_PROMPT,
        userPrompt: chunks[i],
        maxTokens: 500,
      });

      // Step 3: Embed the chunk
      const chunkEmbedding = await embed(chunks[i]);

      // Step 4: Store in knowledge_chunks
      const { error } = await supabase.from('knowledge_chunks').insert({
        source_type: sourceType,
        source_name: sourceName,
        source_date: sourceDate || null,
        chunk_text: chunks[i],
        chunk_index: i,
        tickers_mentioned: metadata?.tickers || [],
        investors_mentioned: metadata?.investors || [],
        sectors_mentioned: metadata?.sectors || [],
        topics: metadata?.topics || [],
        embedding: chunkEmbedding,
      });

      if (error) {
        console.error(`[Ingest] Chunk ${i} store error:`, error.message);
      } else {
        stored++;
      }
    } catch (err) {
      console.error(`[Ingest] Chunk ${i} failed:`, err.message);
    }
  }

  console.log(`[Ingest] "${sourceName}": ${stored}/${chunks.length} chunks stored`);
  return { chunks_total: chunks.length, chunks_stored: stored };
}

/**
 * Simple sentence-boundary chunking with overlap.
 */
function chunkText(text, targetTokens, overlap) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    const combined = current + ' ' + sentence;
    if (combined.split(/\s+/).length > targetTokens && current.trim()) {
      chunks.push(current.trim());
      // Overlap: keep last N words from previous chunk
      const words = current.split(/\s+/);
      current = words.slice(-overlap).join(' ') + ' ' + sentence;
    } else {
      current = combined;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

module.exports = { ingestDocument, chunkText };
