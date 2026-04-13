const { complete, completeJSON } = require('./llm');
const supabase = require('./supabase');
const log = require('./logger').child({ module: 'chat' });

async function routeMessage(message, sessionId) {
  // Step 1: Classify intent
  const intent = await completeJSON({
    task: 'SIGNAL_EXTRACT',
    systemPrompt: `You are a router for SimuAlpha's chat interface. Classify the user's message intent.

Return JSON:
{
  "intent": "ANALYZE_STOCK" | "COMPARE_STOCKS" | "EXPLAIN_SCORE" | "INVESTOR_QUESTION" | "WAVE_QUESTION" | "GENERAL_QUESTION" | "PORTFOLIO_QUESTION",
  "tickers": ["MSFT"],
  "response_type": "FULL_ANALYSIS" | "QUICK_ANSWER" | "DATA_LOOKUP"
}`,
    userPrompt: message,
    maxTokens: 300,
  });

  if (!intent) {
    return { response: "I couldn't understand that. Try asking about a specific stock, like 'What do you think about MSFT?'", skills_used: [], tickers: [] };
  }

  const skillsUsed = [];
  let context = '';

  // Step 2: Gather context based on intent
  if (intent.tickers?.length > 0) {
    const ticker = intent.tickers[0];

    const { data: stock } = await supabase.from('screener_results')
      .select('*').eq('ticker', ticker).maybeSingle();
    if (stock) {
      context += `\nScreener data for ${ticker}: Score ${stock.total_score}/100, Signal: ${stock.signal}, Price: $${stock.current_price}, Fundamental: ${stock.fundamental_score}/50, Technical: ${stock.technical_score}/50, P/E: ${stock.pe_ratio}, Revenue Growth: ${stock.revenue_growth_pct}%\n`;
    }

    const { data: analysis } = await supabase.from('stock_analysis')
      .select('bull_case, bear_case, one_liner, thesis_summary')
      .eq('ticker', ticker)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (analysis?.thesis_summary) context += `\nThesis: ${analysis.thesis_summary.slice(0, 500)}\n`;
    if (analysis?.one_liner) context += `One-liner: "${analysis.one_liner}"\n`;

    const { data: sain } = await supabase.from('sain_consensus')
      .select('*').eq('ticker', ticker)
      .order('computed_date', { ascending: false }).limit(1);
    if (sain?.[0]) context += `\nSAIN Consensus: Score ${sain[0].total_sain_score}, Layers aligned: ${sain[0].layers_aligned}/4, FSC: ${sain[0].is_full_stack_consensus}\n`;

    const { data: holdings } = await supabase.from('investor_holdings')
      .select('investor_id, signal_type, pct_of_portfolio')
      .eq('ticker', ticker);
    if (holdings?.length) {
      context += `\nInvestor positions: ${holdings.length} super investors hold this stock\n`;
    }
  }

  // Step 3: Trigger analysis if needed
  if (intent.intent === 'ANALYZE_STOCK' && intent.tickers?.length > 0) {
    try {
      const { analyzeStock } = require('./orchestrator');
      analyzeStock(intent.tickers[0]).catch(e => log.error({ err: e }, 'Chat-triggered analysis failed'));
      skillsUsed.push('analyzeStock');
    } catch { /* non-critical */ }
  }

  // Step 4: Generate response
  const response = await complete({
    task: 'THESIS',
    systemPrompt: `You are The Long Screener's AI assistant. You help investors understand stock opportunities using TLI methodology.

RULES:
- Never say "buy" or "sell" directly. Use "entering accumulation zone", "approaching support", "trim zone reached", etc.
- Reference real data when available. Lead with the score and signal.
- Be concise but insightful. 2-3 paragraphs max.
- If you triggered a full analysis, mention that a detailed thesis is being generated.
- Reference super investor positions and SAIN consensus when available.
- End with "Not financial advice" disclaimer.`,
    userPrompt: `User message: "${message}"

Available context:
${context || 'No specific stock data available for this query.'}

Respond naturally and helpfully.`,
    maxTokens: 800,
  });

  return {
    response: response || "I wasn't able to generate a response. Please try again.",
    skills_used: skillsUsed,
    tickers: intent.tickers || [],
    intent: intent.intent,
  };
}

module.exports = { routeMessage };
