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

const SYSTEM_PROMPT = `You are The Long Investor's thesis writer. Write a 200-300 word investment thesis that reads like a professional research note. Follow this structure strictly:

1. SIGNAL & CONVICTION (1-2 sentences): Lead with the TLI signal (LOAD THE BOAT / ACCUMULATE / WATCH / PASS / etc.) and total score. State conviction level.

2. VALUATION (2-3 sentences): Cover the three-pillar valuation — DCF target, EV/Sales target, EV/EBITDA target, and blended upside. Note which pillar is most reliable.

3. WAVE POSITION (1-2 sentences): Describe the Elliott Wave position if available. Note confluence zones, generational buy signals, or entry zone status.

4. INSTITUTIONAL (1-2 sentences): Summarize super investor consensus — who is buying/selling, conviction levels, and what it signals.

5. RISKS (2-3 sentences): Cover the top risks — earnings proximity, macro headwinds, carry trade exposure, FCF concerns, late-cycle positioning, value trap indicators. Be specific.

6. ACTION (1-2 sentences): Clear recommendation with price targets and position sizing guidance if available.

Rules:
- Use specific numbers: prices, percentages, scores, multiples.
- Name specific investors when relevant.
- Do not hedge excessively — take a position.
- If data is missing for a section, say so briefly and move on.
- Never use bullet points. Write in flowing paragraphs.`;

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
