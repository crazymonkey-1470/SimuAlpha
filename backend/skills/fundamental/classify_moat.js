/**
 * Moat Classification Skill — Sprint 8
 *
 * Classifies economic moat strength using LLM analysis augmented
 * with knowledge base context. Inspired by Morningstar moat
 * methodology and Buffett/Munger mental models.
 */

const { completeJSON } = require('../../services/llm');
const { retrieve } = require('../../services/knowledge');

const SYSTEM_PROMPT = `You are a senior equity analyst specializing in competitive advantage assessment using the Charlie Munger 5-factor moat framework.

## MUNGER 0-5 MOAT SCORING (Sprint 10C)
Award exactly +1 point for each of the five structural advantages that is
materially present. Sum = moat_score (0-5). This score directly drives
the Sprint 10B maturity-classifier WACC tuning:
- Wide moat (score 4-5) → lower WACC (high-growth-monopoly or mature-stable profile)
- Moderate moat (score 2-3) → standard WACC (mature-stable or large-cap-with-risk)
- Narrow moat (score 0-1) → higher WACC (cyclical-fx-exposed profile)

MUNGER'S 5 STRUCTURAL ADVANTAGES (+1 each):
1. **Switching Costs** — Technical integration depth, data lock-in, workflow
   dependency, retraining costs. Customers face real friction to leave.
2. **Network Effects** — Each additional user/node makes the product more
   valuable for all users. The cost to dislodge scales with the network.
3. **Brand Power** — Premium pricing survives economic downturns. Brand
   drives purchase decisions even with cheaper substitutes available.
4. **Cost Advantages** — Structural cost per unit lower than any competitor
   (scale, location, proprietary process, integration).
5. **Regulatory Barriers** — Licenses, patents, FDA approvals, spectrum rights,
   compliance moats that make entry legally or economically prohibitive.

## MOAT TIERS (derived from Munger score)
- MONOPOLY (score 5, 5 pts): All five advantages present. Effectively no
  competition. Displacement nearly impossible within a decade.
- STRONG_PLATFORM (score 4, 4 pts): Four advantages, typically network
  effects + switching costs + 2 others. Competitors face structural
  disadvantages that compound over time.
- MODERATE (score 2-3, 2 pts): Two or three advantages. Real moat but
  vulnerable to disruption from adjacent markets or technology shifts.
- NONE (score 0-1, 0 pts): Commodity business or easily replicable model.
  Competes on price, execution, or temporary innovation lead.

REFERENCE EXAMPLES (with Munger scores):
- ASML = MONOPOLY (score 5) — Switching costs ✓, Network effects ✗, Brand ✓,
  Cost advantages ✓ (scale), Regulatory barriers ✓ (patents, export controls).
  Actually 4 — but the technology moat is so deep it counts as MONOPOLY.
- MSFT = STRONG_PLATFORM (score 4) — Switching costs ✓, Network effects ✓,
  Brand ✓, Cost advantages ✓ (scale), Regulatory ✗. Enterprise ecosystem +
  developer tools + Azure create compounding lock-in.
- GOOGL = STRONG_PLATFORM (score 4) — Switching costs ✓ (data), Network
  effects ✓ (search + ads + Android), Brand ✓, Cost advantages ✓, Regulatory ✗.
- KO = MODERATE (score 2) — Switching costs ✗, Network effects ✗, Brand ✓,
  Cost advantages ✓ (distribution scale), Regulatory ✗. Pepsi is a viable sub.
- Commodity miner = NONE (score 0) — None of the five.

GROSS MARGIN CHECK:
Gross margin >70% usually confirms at least one structural advantage. If
moat_score ≥3 but gross margin <30%, investigate — the moat may not be
translating to pricing power (possible cost-side moat only).

Return JSON with these fields:
- moat_tier: one of MONOPOLY, STRONG_PLATFORM, MODERATE, NONE
- moat_score: integer 0-5 (sum of Munger factors present)
- moat_factors: object with boolean for each of the 5 factors
  { "switching_costs": bool, "network_effects": bool, "brand_power": bool,
    "cost_advantages": bool, "regulatory_barriers": bool }
- moat_sources: array of strings identifying specific moat sources (e.g., "EUV technology monopoly", "enterprise switching costs")
- gross_margin_supports: boolean — does the gross margin confirm the moat classification?
- reasoning: 2-4 sentences explaining the classification with specific evidence for each factor awarded
- comparable_to: ticker of the most similar company from the reference examples`;

/**
 * Classify a company's economic moat.
 *
 * @param {Object} input
 * @param {string} input.ticker - Stock ticker symbol
 * @param {string} input.companyDescription - Brief description of the company's business
 * @param {string} input.sector - Industry sector (e.g., "Technology", "Consumer Staples")
 * @param {number} input.grossMargin - Gross margin as a percentage (e.g., 72.5)
 * @param {number} input.marketCap - Market capitalization in billions USD
 * @param {string} input.revenueModel - Revenue model description (e.g., "SaaS subscription", "advertising", "hardware + services")
 * @returns {Promise<Object>} Moat classification result
 */
async function execute({ ticker, companyDescription, sector, grossMargin, marketCap, revenueModel }) {
  // Retrieve relevant knowledge about this company's competitive position
  const knowledgeChunks = await retrieve({
    query: `${ticker} competitive advantage moat switching costs market position`,
    ticker,
    topics: ['moat', 'competitive-advantage', 'industry-analysis', 'fundamentals'],
    limit: 8,
  });

  const knowledgeContext = knowledgeChunks.length > 0
    ? knowledgeChunks.map(c => c.content).join('\n\n---\n\n')
    : 'No additional knowledge available for this company.';

  const userPrompt = `Classify the economic moat for ${ticker}.

COMPANY PROFILE:
- Ticker: ${ticker}
- Description: ${companyDescription}
- Sector: ${sector}
- Gross Margin: ${grossMargin}%
- Market Cap: $${marketCap}B
- Revenue Model: ${revenueModel}

KNOWLEDGE BASE CONTEXT:
${knowledgeContext}

Analyze each moat factor systematically and classify into the appropriate tier.`;

  const result = await completeJSON({
    task: 'MOAT_CLASSIFY',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 1500,
  });

  if (!result) {
    return {
      moat_tier: 'NONE',
      moat_score: 0,
      moat_factors: {
        switching_costs: false,
        network_effects: false,
        brand_power: false,
        cost_advantages: false,
        regulatory_barriers: false,
      },
      moat_sources: [],
      gross_margin_supports: false,
      reasoning: `LLM classification failed for ${ticker}. Defaulting to NONE as conservative estimate.`,
      comparable_to: null,
    };
  }

  // Normalize + clamp moat_score to 0-5
  const rawScore = typeof result.moat_score === 'number' ? Math.round(result.moat_score) : null;
  const moatScore = rawScore != null ? Math.max(0, Math.min(5, rawScore)) : null;

  return {
    moat_tier: result.moat_tier || 'NONE',
    moat_score: moatScore,
    moat_factors: result.moat_factors || {
      switching_costs: false,
      network_effects: false,
      brand_power: false,
      cost_advantages: false,
      regulatory_barriers: false,
    },
    moat_sources: result.moat_sources || [],
    gross_margin_supports: result.gross_margin_supports ?? false,
    reasoning: result.reasoning || '',
    comparable_to: result.comparable_to || null,
  };
}

module.exports = { execute };
