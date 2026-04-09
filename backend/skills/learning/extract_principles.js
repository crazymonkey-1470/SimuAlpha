/**
 * Skill: Extract Investing Principles
 *
 * Extracts structured investing principles from documents — scoring rules,
 * investor signals, general principles, red flags, and sector-specific signals.
 *
 * execute({ documentText, sourceName, sourceType })
 * -> { scoring_rules, investor_signals, principles, red_flags, sector_signals }
 */

const { completeJSON } = require('../../services/llm');
const { retrieve } = require('../../services/knowledge');

const SYSTEM_PROMPT = `You are an investment research analyst who extracts actionable investing principles from documents. Given a document (research note, investor letter, earnings analysis, 13F commentary, etc.), extract structured data in five categories:

1. SCORING RULES: Quantitative rules that could be encoded in a scoring algorithm.
   Format: { "factor": "...", "condition": "...", "points": number, "direction": "bonus|penalty", "source": "..." }
   Example: { "factor": "fcf_margin", "condition": ">20% with YoY growth", "points": 10, "direction": "bonus", "source": "Buffett FCF principle" }

2. INVESTOR SIGNALS: Specific investor actions or patterns that indicate conviction.
   Format: { "investor": "...", "signal": "...", "interpretation": "...", "conviction": "LOW|MODERATE|HIGH|EXTREME" }
   Example: { "investor": "Druckenmiller", "signal": "New position >5% of portfolio", "interpretation": "High-conviction secular bet", "conviction": "EXTREME" }

3. PRINCIPLES: General investing principles or mental models.
   Format: { "principle": "...", "context": "...", "attribution": "..." }
   Example: { "principle": "Never average down on a broken thesis", "context": "When revenue growth turns negative after being >20%", "attribution": "Laffont exit rule" }

4. RED FLAGS: Warning signals that indicate danger.
   Format: { "flag": "...", "severity": "LOW|MODERATE|HIGH|CRITICAL", "action": "..." }
   Example: { "flag": "GAAP vs Non-GAAP earnings divergence >20%", "severity": "HIGH", "action": "Reduce position or add penalty to score" }

5. SECTOR SIGNALS: Sector-specific insights or rotation signals.
   Format: { "sector": "...", "signal": "...", "implication": "..." }
   Example: { "sector": "Information Technology", "signal": "AI capex exceeding FCF generation", "implication": "Potential FCF compression — apply capex risk penalty" }

RULES:
- Extract ONLY what is explicitly or strongly implied in the document.
- Do not invent principles that aren't supported by the text.
- Be specific and quantitative when the document provides numbers.
- Each category can have 0 items if the document doesn't contain that type of information.
- Attribute principles to specific investors/sources when possible.

Respond with JSON: { "scoring_rules": [...], "investor_signals": [...], "principles": [...], "red_flags": [...], "sector_signals": [...] }`;

async function execute({ documentText, sourceName, sourceType }) {
  if (!documentText || documentText.trim().length === 0) {
    throw new Error('[extract_principles] documentText is required and must be non-empty');
  }

  // Optionally retrieve existing principles to avoid duplicates
  let existingContext = '';
  try {
    const existing = await retrieve({
      query: `investing principles scoring rules red flags ${sourceName || ''}`,
      sourceTypes: sourceType ? [sourceType] : null,
      limit: 5,
      similarityThreshold: 0.75,
    });
    if (existing && existing.length > 0) {
      existingContext = '\n\nEXISTING PRINCIPLES IN KNOWLEDGE BASE (avoid exact duplicates):\n' +
        existing.map(c => `- ${c.content?.substring(0, 200)}`).join('\n');
    }
  } catch (err) {
    console.error(`[extract_principles] Knowledge retrieval failed:`, err.message);
    // Non-fatal
  }

  // Truncate document text if too long to fit in context
  const MAX_DOC_LENGTH = 12000;
  let truncatedText = documentText;
  let truncationNote = '';
  if (documentText.length > MAX_DOC_LENGTH) {
    truncatedText = documentText.substring(0, MAX_DOC_LENGTH);
    truncationNote = `\n\n[NOTE: Document was truncated from ${documentText.length} to ${MAX_DOC_LENGTH} characters. Extract principles from the available text.]`;
  }

  const userPrompt = `SOURCE: ${sourceName || 'Unknown Document'}
TYPE: ${sourceType || 'Unknown'}

DOCUMENT TEXT:
${truncatedText}${truncationNote}${existingContext}`;

  let result;
  try {
    result = await completeJSON({
      task: 'DOCUMENT_INGEST',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 3000,
    });
  } catch (err) {
    console.error(`[extract_principles] LLM extraction failed:`, err.message);
    throw new Error(`Principle extraction failed: ${err.message}`);
  }

  if (!result) {
    throw new Error('[extract_principles] LLM returned null — could not parse JSON response');
  }

  // Validate and normalize the response
  const validated = {
    scoring_rules: validateArray(result.scoring_rules, (item) =>
      item.factor && item.condition && typeof item.points === 'number' && item.direction
    ),
    investor_signals: validateArray(result.investor_signals, (item) =>
      item.investor && item.signal && item.interpretation
    ),
    principles: validateArray(result.principles, (item) =>
      item.principle
    ),
    red_flags: validateArray(result.red_flags, (item) =>
      item.flag && item.severity
    ),
    sector_signals: validateArray(result.sector_signals, (item) =>
      item.sector && item.signal
    ),
  };

  const totalExtracted = Object.values(validated).reduce((sum, arr) => sum + arr.length, 0);
  if (totalExtracted === 0) {
    console.warn(`[extract_principles] No principles extracted from "${sourceName}"`);
  }

  return validated;
}

/**
 * Validate an array of items, keeping only those that pass the validator.
 */
function validateArray(arr, validator) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(item => {
    try {
      return item && typeof item === 'object' && validator(item);
    } catch {
      return false;
    }
  });
}

module.exports = { execute };
