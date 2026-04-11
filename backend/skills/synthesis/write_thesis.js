/**
 * Skill: Write Investment Thesis
 *
 * The main thesis writer. Takes ALL analysis outputs and produces a 200-300 word
 * investment thesis. Uses knowledge base retrieval for additional context.
 *
 * execute({ ticker, companyName, sector, scoreResult, waveAnalysis, valuation,
 *           institutional, macroContext, earningsQuality, moatAnalysis,
 *           positionSizing, currentPrice })
 * -> { ticker, thesis, generated_at, model_used }
 */

const { complete, MODEL_CONFIG } = require('../../services/llm');
const { retrieve } = require('../../services/knowledge');

const SYSTEM_PROMPT = `You are The Long Investor's thesis writer. Write a 200-300 word investment thesis that reads like a professional research note.

═══════════════════════════════════════════════════════
SCORING STRUCTURE (v3) — reference this in the thesis
═══════════════════════════════════════════════════════
The stock's total TLI score (0-100) comes from three pillars:
- Fundamental Score (0-30): Revenue growth, gross margin, FCF, balance sheet, TAM, moat
- Wave Position Score (-15 to +30): based on Elliott Wave cycle position
- Confluence Score (0-40): how many support signals align at current price

PRE-FILTERS APPLIED:
- Lynch Screen (0-7): P/E, forward P/E, D/E, EPS growth, PEG, market cap, insider buying
- Buffett Screen (0-9): stricter value criteria + management quality
- DUAL SCREEN PASS = both pass = highest quality
- Financial Health Check (0-12 red flags): 3+ = degraded quality
- Fundamental Gate: hard pass/fail — if failed, DISQUALIFIED

ACTION LABELS (reference these, do NOT say "buy" or "sell"):
85-100: LOAD THE BOAT — maximum conviction entry zone
70-84:  ACCUMULATE — strong setup, scale in
55-69:  WATCHLIST — bullish setup, not yet entry
40-54:  HOLD — maintain existing position
25-39:  CAUTION — elevated risk, reduce exposure
10-24:  TRIM — take profits, de-risk
0-9:    AVOID — no setup

POSITION SIZING uses 5 INCREASING tranches: 10% → 15% → 20% → 25% → 30%
as confirmation increases through the wave cycle. Never equal tranches.

WAVE-BASED TRIM SCHEDULE:
- Wave 3 top: trim 20%
- Wave 4 complete: re-add to full
- Wave 5 top: trim 50%
- Wave C complete: cycle restart (5-tranche DCA begins fresh)

LANGUAGE RULES — NEVER say "buy" or "sell" directly. Use:
"entering accumulation zone" / "approaching support" / "trim zone reached" /
"target achieved" / "watchlist setup detected" / "confluence zone active" /
"scaling in at tranche N/5" / "re-adding on Wave 4 pullback" /
"defensive — Wave 5 distribution"

SPRINT 10B CLASSIFICATION FIELDS (reference when present):
- Lynch Category (Fast Grower / Stalwart / Slow Grower / Cyclical / Turnaround)
- PEG Ratio (attractive <1, fair <1.5, elevated <2, expensive ≥2)
- Margin of Safety (STRONG >15%, ADEQUATE >10%, INSUFFICIENT <10%)
- Kill Thesis Flags (3+ forces downgrade)
- Multiple Compression (DEEP_VALUE, VALUE_TRAP, OVERVALUED)
- Method Agreement (HIGH / MEDIUM / LOW across DCF, EV/Sales, EV/EBITDA)

═══════════════════════════════════════════════════════
THESIS STRUCTURE
═══════════════════════════════════════════════════════
1. SIGNAL & CONVICTION (1-2 sentences): Lead with the TLI action label (LOAD THE BOAT / ACCUMULATE / WATCHLIST / HOLD / CAUTION / TRIM / AVOID) and total score. State conviction level.

2. VALUATION (2-3 sentences): Cover the three-pillar valuation — DCF target, EV/Sales target, EV/EBITDA target, blended upside, and method agreement. Note DCF exclusion if applicable. Reference margin of safety and PEG where relevant.

3. WAVE POSITION (1-2 sentences): Describe the Elliott Wave position. Note confluence zones, generational buy signals, tranche number, or entry zone status. Reference NVDA-style benchmark accuracy when relevant.

4. INSTITUTIONAL & CLASSIFICATION (1-2 sentences): Summarize super investor consensus AND Lynch category / moat tier / rating.

5. RISKS (2-3 sentences): Cover kill thesis flags, earnings proximity, macro headwinds, carry trade, late-cycle positioning, multiple compression. Be specific.

6. ACTION (1-2 sentences): Clear language-compliant recommendation with price targets and tranche guidance.

Rules:
- Use specific numbers: prices, percentages, scores, multiples.
- Name specific investors when relevant.
- Do not hedge excessively — take a position.
- If data is missing for a section, say so briefly and move on.
- Never use bullet points. Write in flowing paragraphs.
- NEVER use the words "buy" or "sell" as verbs — substitute with the language rules above.`;

async function execute({
  ticker,
  companyName,
  sector,
  scoreResult,
  waveAnalysis,
  valuation,
  institutional,
  macroContext,
  earningsQuality,
  moatAnalysis,
  positionSizing,
  currentPrice,
}) {
  if (!ticker) throw new Error('[write_thesis] ticker is required');

  // Retrieve relevant knowledge base context
  let knowledgeContext = '';
  try {
    const chunks = await retrieve({
      query: `${ticker} ${companyName || ''} ${sector || ''} investment thesis valuation`,
      ticker,
      topics: ['valuation', 'thesis', 'scoring', 'institutional'],
      limit: 5,
      similarityThreshold: 0.65,
    });
    if (chunks && chunks.length > 0) {
      knowledgeContext = '\n\nKNOWLEDGE BASE CONTEXT:\n' + chunks.map(c =>
        `[${c.source_name || 'unknown'}] ${c.content}`
      ).join('\n---\n');
    }
  } catch (err) {
    console.error(`[write_thesis] Knowledge retrieval failed for ${ticker}:`, err.message);
    // Non-fatal — continue without knowledge context
  }

  // Build the comprehensive user prompt
  const sections = [];

  sections.push(`TICKER: ${ticker}`);
  sections.push(`COMPANY: ${companyName || 'Unknown'}`);
  sections.push(`SECTOR: ${sector || 'Unknown'}`);
  sections.push(`CURRENT PRICE: ${currentPrice != null ? `$${currentPrice}` : 'N/A'}`);

  // Score result
  if (scoreResult) {
    sections.push(`\nSCORE RESULT:
  Signal: ${scoreResult.signal || 'N/A'}
  Total Score: ${scoreResult.totalScore ?? 'N/A'}/100
  Fundamental: ${scoreResult.fundamentalScore ?? scoreResult.fundamentalBase ?? 'N/A'}/50
  Technical: ${scoreResult.technicalScore ?? scoreResult.technicalBase ?? 'N/A'}/50
  Bonus: +${scoreResult.bonusPoints ?? 0} | Penalty: ${scoreResult.penaltyPoints ?? 0}
  Entry Zone: ${scoreResult.entryZone ? 'YES' : 'NO'}${scoreResult.entryNote ? ` — ${scoreResult.entryNote}` : ''}
  Confluence Zone: ${scoreResult.confluenceZone ? 'YES' : 'NO'}${scoreResult.confluenceNote ? ` — ${scoreResult.confluenceNote}` : ''}
  Generational Buy: ${scoreResult.generationalBuy ? 'YES' : 'NO'}
  Flags: ${scoreResult.flags?.length > 0 ? scoreResult.flags.join(', ') : 'None'}`);
  } else {
    sections.push('\nSCORE RESULT: Not available.');
  }

  // Valuation
  if (valuation) {
    const v = valuation.valuation || valuation;
    sections.push(`\nVALUATION (Three-Pillar):
  DCF Target: ${v.dcf?.target != null ? `$${v.dcf.target} (${v.dcf.upside > 0 ? '+' : ''}${v.dcf.upside}%)` : 'N/A'}
  EV/Sales Target: ${v.evSales?.target != null ? `$${v.evSales.target} (${v.evSales.upside > 0 ? '+' : ''}${v.evSales.upside}%)` : 'N/A'}
  EV/EBITDA Target: ${v.evEbitda?.target != null ? `$${v.evEbitda.target} (${v.evEbitda.upside > 0 ? '+' : ''}${v.evEbitda.upside}%)` : 'N/A'}
  Blended Target: ${v.avgTarget != null ? `$${v.avgTarget} (${v.avgUpside > 0 ? '+' : ''}${v.avgUpside}%)` : 'N/A'}
  Rating: ${v.rating || 'N/A'} | WACC: ${v.wacc ?? 'N/A'}% (${v.waccTier || 'N/A'} risk)
  Score: ${valuation.score?.pts ?? 'N/A'} pts | Flags: ${valuation.score?.flags?.join(', ') || 'None'}`);
  } else {
    sections.push('\nVALUATION: Not available.');
  }

  // Wave analysis
  if (waveAnalysis) {
    sections.push(`\nELLIOTT WAVE ANALYSIS:
  ${typeof waveAnalysis === 'string' ? waveAnalysis : JSON.stringify(waveAnalysis, null, 2)}`);
  } else {
    sections.push('\nELLIOTT WAVE ANALYSIS: Not available.');
  }

  // Institutional
  if (institutional) {
    if (institutional.interpretation) {
      sections.push(`\nINSTITUTIONAL CONSENSUS:
  ${institutional.interpretation}`);
    } else if (institutional.consensus) {
      const c = institutional.consensus;
      sections.push(`\nINSTITUTIONAL CONSENSUS:
  Sentiment: ${c.net_sentiment || 'N/A'} | Score: ${c.consensus_score ?? 'N/A'}
  Holders: ${c.holders_count ?? 0} | New Buyers: ${c.new_buyers_count ?? 0} | Sellers: ${c.sellers_count ?? 0}`);
    } else {
      sections.push('\nINSTITUTIONAL: No institutional data.');
    }
  } else {
    sections.push('\nINSTITUTIONAL: Not available.');
  }

  // Macro context
  if (macroContext) {
    if (macroContext.reasoning) {
      sections.push(`\nMACRO ENVIRONMENT:
  Risk Level: ${macroContext.risk_level || 'N/A'}
  Carry Trade Relevant: ${macroContext.carry_trade_relevant ? 'YES' : 'NO'}
  ${macroContext.reasoning}`);
    } else {
      sections.push(`\nMACRO ENVIRONMENT:
  Market Risk: ${macroContext.market_risk_level || macroContext.risk_level || 'N/A'}
  Late Cycle Score: ${macroContext.late_cycle_score ?? 'N/A'}
  Carry Trade Risk: ${macroContext.carry_trade_risk || 'N/A'}`);
    }
  } else {
    sections.push('\nMACRO ENVIRONMENT: Not available.');
  }

  // Earnings quality
  if (earningsQuality) {
    sections.push(`\nEARNINGS QUALITY:
  ${typeof earningsQuality === 'string' ? earningsQuality : JSON.stringify(earningsQuality)}`);
  }

  // Moat analysis
  if (moatAnalysis) {
    sections.push(`\nMOAT ANALYSIS:
  ${typeof moatAnalysis === 'string' ? moatAnalysis : JSON.stringify(moatAnalysis)}`);
  }

  // Position sizing
  if (positionSizing) {
    sections.push(`\nPOSITION SIZING:
  ${typeof positionSizing === 'string' ? positionSizing : JSON.stringify(positionSizing)}`);
  }

  const userPrompt = sections.join('\n') + knowledgeContext;

  // Generate the thesis
  let thesis;
  try {
    thesis = await complete({
      task: 'THESIS',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 1500,
    });
  } catch (err) {
    console.error(`[write_thesis] LLM thesis generation failed for ${ticker}:`, err.message);
    throw new Error(`Thesis generation failed for ${ticker}: ${err.message}`);
  }

  if (!thesis || thesis.trim().length === 0) {
    throw new Error(`[write_thesis] Empty thesis returned for ${ticker}`);
  }

  return {
    ticker,
    thesis: thesis.trim(),
    generated_at: new Date().toISOString(),
    model_used: MODEL_CONFIG.THESIS,
  };
}

module.exports = { execute };
