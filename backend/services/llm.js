/**
 * Model-Agnostic LLM Interface — Sprint 8
 *
 * Every AI call in the system goes through this ONE interface.
 * Change models here, affects the entire system.
 */

const Anthropic = require('@anthropic-ai/sdk');
const supabase = require('./supabase');
const log = require('./logger').child({ module: 'llm' });

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Model config — change models here, affects entire system
const MODEL_CONFIG = {
  THESIS:           'claude-haiku-4-5-20251001',
  WAVE_INTERPRET:   'claude-haiku-4-5-20251001',
  MOAT_CLASSIFY:    'claude-haiku-4-5-20251001',
  SIGNAL_EXTRACT:   'claude-haiku-4-5-20251001',
  DOCUMENT_INGEST:  'claude-haiku-4-5-20251001',
  WEIGHT_ADJUST:    'claude-haiku-4-5-20251001',
  MACRO_ASSESS:     'claude-haiku-4-5-20251001',
  SOCIAL_SCAN:      'claude-haiku-4-5-20251001',
  COMPARE_GREATS:   'claude-haiku-4-5-20251001',
};

/**
 * Core completion function — all LLM calls route through here.
 */
async function complete({ task, systemPrompt, userPrompt, maxTokens = 2000 }) {
  const model = MODEL_CONFIG[task] || MODEL_CONFIG.THESIS;
  const startTime = Date.now();

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const elapsed = Date.now() - startTime;
  const text = response.content[0]?.text || '';

  // Log every call for audit trail
  try {
    await supabase.from('llm_calls').insert({
      task,
      model,
      input_tokens: response.usage?.input_tokens || null,
      output_tokens: response.usage?.output_tokens || null,
      elapsed_ms: elapsed,
      created_at: new Date().toISOString(),
    });
  } catch (_) { /* llm_calls table may not exist yet */ }

  return text;
}

/**
 * Structured output helper — asks for JSON, parses safely.
 */
async function completeJSON({ task, systemPrompt, userPrompt, maxTokens = 2000 }) {
  const raw = await complete({
    task,
    systemPrompt: systemPrompt + '\n\nRespond ONLY with valid JSON. No preamble, no markdown.',
    userPrompt,
    maxTokens,
  });

  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (e) {
    log.error({ task, rawSnippet: raw.slice(0, 200) }, 'JSON parse failed');
    return null;
  }
}

module.exports = { complete, completeJSON, MODEL_CONFIG };
