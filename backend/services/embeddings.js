/**
 * Embedding Service — Sprint 8
 *
 * Uses Voyage AI voyage-3-lite (1024 dimensions).
 * Anthropic's official embedding partner — no OpenAI dependency needed.
 * Free tier available at https://dash.voyageai.com
 */

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3-lite';

/**
 * Generate an embedding vector for a text string.
 * Returns a 1024-dimension float array.
 */
async function embed(text) {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot embed empty text');
  }

  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY not set');

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: [text.slice(0, 16000)],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voyage AI error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Batch embed multiple texts (more efficient for bulk operations).
 */
async function embedBatch(texts) {
  if (!texts || texts.length === 0) return [];

  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY not set');

  const cleaned = texts.map(t => (t || '').slice(0, 16000));

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: cleaned,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voyage AI batch error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.data.map(d => d.embedding);
}

module.exports = { embed, embedBatch };
