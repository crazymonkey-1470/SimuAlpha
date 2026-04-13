/**
const log = require('../../services/logger').child({ module: 'extract_principles' });
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

const SYSTEM_PROMPT = `You are an investment research analyst who extracts actionable investing principles from documents and maps them to the correct layer of SimuAlpha's v3 scoring architecture.

═══════════════════════════════════════════════════════
CURRENT SCORING ARCHITECTURE (v3) — map every rule to a layer
═══════════════════════════════════════════════════════
- FUNDAMENTAL layer (0-30): 6 components × 5pts — revenue growth, gross margin, FCF, balance sheet, TAM, moat
- WAVE layer (-15 to +30): 9 wave states (W2 entry, W3 hold, W4 re-add, W5 trim, ending diagonal, etc.)
- CONFLUENCE layer (0-40): 10-item support stack (200WMA, 0.618 Fib, W1 origin, etc.) + bonuses
- SCREEN layer: Lynch (0-7), Buffett (0-9), Health Check (0-12 red flags)
- SAIN layer: 4-layer consensus (super investors, politicians, AI models, TLI)
- RISK layer: chase filter, earnings blackout, sentiment, kill thesis flags
- MACRO layer: market risk level, late cycle score, carry trade risk

When extracting rules, map them to the correct layer:
- Company quality → FUNDAMENTAL or SCREEN
- Price levels / chart patterns → WAVE or CONFLUENCE
- Investor behavior / positioning → SAIN or INSTITUTIONAL
- Risk factors / red flags → RISK or Kill Thesis
- Macroeconomic conditions → MACRO

═══════════════════════════════════════════════════════
EXTRACTION CATEGORIES
═══════════════════════════════════════════════════════

1. SCORING RULES: Quantitative rules with explicit v3 layer mapping.
   Format: {
     "rule": "description",
     "factor": "...",
     "layer": "FUNDAMENTAL | WAVE | CONFLUENCE | SCREEN | SAIN | RISK | MACRO",
     "proposed_points": number,
     "condition": "when this triggers",
     "direction": "bonus|penalty",
     "source": "document name",
     "confidence": 0.0-1.0,
     "conflicts_with": "any existing rule it might conflict with, or NONE"
   }
   Example: {
     "rule": "FCF margin above 20% with YoY growth earns a score bonus",
     "factor": "fcf_margin_growing",
     "layer": "FUNDAMENTAL",
     "proposed_points": 5,
     "condition": "fcf_margin > 20 AND fcf_growth > 0",
     "direction": "bonus",
     "source": "Buffett 2023 Letter",
     "confidence": 0.9,
     "conflicts_with": "NONE"
   }

2. INVESTOR SIGNALS: Specific investor actions or patterns that indicate conviction.
   Format: { "investor": "...", "signal": "...", "interpretation": "...", "conviction": "LOW|MODERATE|HIGH|EXTREME" }
   Example: { "investor": "Druckenmiller", "signal": "New position >5% of portfolio", "interpretation": "High-conviction secular bet", "conviction": "EXTREME" }

3. PRINCIPLES: General investing principles or mental models.
   Format: { "principle": "...", "context": "...", "attribution": "..." }
   Example: { "principle": "Never average down on a broken thesis", "context": "When revenue growth turns negative after being >20%", "attribution": "Laffont exit rule" }

4. RED FLAGS: Warning signals that indicate danger.
   Format: { "flag": "...", "severity": "LOW|MODERATE|HIGH|CRITICAL", "action": "...", "layer": "RISK" }
   Example: { "flag": "GAAP vs Non-GAAP earnings divergence >20%", "severity": "HIGH", "action": "Reduce position or add penalty to score", "layer": "RISK" }

5. SECTOR SIGNALS: Sector-specific insights or rotation signals.
   Format: { "sector": "...", "signal": "...", "implication": "...", "layer": "MACRO" }
   Example: { "sector": "Information Technology", "signal": "AI capex exceeding FCF generation", "implication": "Potential FCF compression — apply capex risk penalty", "layer": "MACRO" }

RULES:
- Extract ONLY what is explicitly or strongly implied in the document.
- Do not invent principles that aren't supported by the text.
- Be specific and quantitative when the document provides numbers.
- Each category can have 0 items if the document doesn't contain that type of information.
- Attribute principles to specific investors/sources when possible.
- EVERY scoring_rule MUST include a "layer" field mapping it to the v3 architecture.
- Flag conflicts_with existing rules when possible (or NONE if no conflict).

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
    log.error(`[extract_principles] Knowledge retrieval failed:`, err.message);
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
    log.error(`[extract_principles] LLM extraction failed:`, err.message);
    throw new Error(`Principle extraction failed: ${err.message}`);
  }

  if (!result) {
    throw new Error('[extract_principles] LLM returned null — could not parse JSON response');
  }

  // Validate and normalize the response
  const VALID_LAYERS = ['FUNDAMENTAL', 'WAVE', 'CONFLUENCE', 'SCREEN', 'SAIN', 'RISK', 'MACRO', 'INSTITUTIONAL'];
  const validated = {
    scoring_rules: validateArray(result.scoring_rules, (item) =>
      item.factor && item.condition && item.direction &&
      (typeof item.points === 'number' || typeof item.proposed_points === 'number') &&
      (!item.layer || VALID_LAYERS.includes(item.layer))
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
    log.warn(`[extract_principles] No principles extracted from "${sourceName}"`);
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
