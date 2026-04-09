/**
 * Embedding Service — Sprint 8
 *
 * Uses OpenAI text-embedding-3-small (1536 dimensions).
 * Cost: ~$0.02 per 1M tokens.
 */

const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Generate an embedding vector for a text string.
 * Returns a 1536-dimension float array.
 */
async function embed(text) {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot embed empty text');
  }

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000), // limit to ~8K chars to stay within token limits
  });

  return response.data[0].embedding;
}

/**
 * Batch embed multiple texts (more efficient for bulk operations).
 */
async function embedBatch(texts) {
  if (!texts || texts.length === 0) return [];

  const cleaned = texts.map(t => (t || '').slice(0, 8000));
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: cleaned,
  });

  return response.data.map(d => d.embedding);
}

module.exports = { embed, embedBatch };
