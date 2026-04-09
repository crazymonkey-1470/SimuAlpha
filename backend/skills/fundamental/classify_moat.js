/**
 * Moat Classification Skill — Sprint 8
 *
 * Classifies economic moat strength using LLM analysis augmented
 * with knowledge base context. Inspired by Morningstar moat
 * methodology and Buffett/Munger mental models.
 */

const { completeJSON } = require('../../services/llm');
const { retrieve } = require('../../services/knowledge');

const SYSTEM_PROMPT = `You are a senior equity analyst specializing in competitive advantage assessment.

Classify the company's economic moat into one of four tiers:

MOAT TIERS:
- MONOPOLY (5 pts): Effectively no competition in core market. Regulatory or technological lock-in so deep that displacement is nearly impossible within a decade. Revenue concentration risk is offset by irreplaceability.
- STRONG_PLATFORM (4 pts): Dominant platform with powerful network effects, high switching costs, AND multiple reinforcing moat sources. Competitors exist but face structural disadvantages that compound over time.
- MODERATE (2 pts): One or two durable advantages (brand, scale, patents) but vulnerable to disruption from adjacent markets or technology shifts. Moat is real but not widening.
- NONE (0 pts): Commodity business or easily replicable model. Competes primarily on price, execution, or temporary innovation lead. No structural barrier to entry.

REFERENCE EXAMPLES:
- ASML = MONOPOLY — Only EUV lithography supplier globally. TSMC, Samsung, Intel all depend on ASML with no alternative. Technological moat is decades deep.
- MSFT = STRONG_PLATFORM — Enterprise ecosystem (Azure + Office 365 + Teams) creates massive switching costs. Network effects in developer tools (GitHub, VS Code). Multiple reinforcing moat sources.
- GOOGL = STRONG_PLATFORM — Search monopoly with >90% share, reinforced by data flywheel. YouTube and Android create additional platform lock-in. Advertising network effects.
- KO = MODERATE — Iconic global brand with unmatched distribution. But no technology moat, no network effects, no switching costs. Pepsi is a viable substitute. Moat is brand + distribution only.

EVALUATION FACTORS (weight each):
1. Gross Margin >70% — Suggests pricing power and low competition
2. Recurring Revenue — Subscription or contractual revenue creates predictability and switching costs
3. Switching Costs — Technical integration depth, data lock-in, workflow dependency, retraining costs
4. Network Effects — Does each additional user/node make the product more valuable for all users?
5. Brand Power — Can the company charge a premium that survives economic downturns?
6. Regulatory Barriers — Licenses, patents, FDA approvals, spectrum rights, or compliance moats

Return JSON with these fields:
- moat_tier: one of MONOPOLY, STRONG_PLATFORM, MODERATE, NONE
- moat_sources: array of strings identifying specific moat sources (e.g., "EUV technology monopoly", "enterprise switching costs")
- gross_margin_supports: boolean — does the gross margin support the moat classification?
- reasoning: 2-4 sentences explaining the classification with specific evidence
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
      moat_sources: [],
      gross_margin_supports: false,
      reasoning: `LLM classification failed for ${ticker}. Defaulting to NONE as conservative estimate.`,
      comparable_to: null,
    };
  }

  return {
    moat_tier: result.moat_tier || 'NONE',
    moat_sources: result.moat_sources || [],
    gross_margin_supports: result.gross_margin_supports ?? false,
    reasoning: result.reasoning || '',
    comparable_to: result.comparable_to || null,
  };
}

module.exports = { execute };
