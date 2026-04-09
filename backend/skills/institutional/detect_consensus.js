/**
 * Skill: Detect Institutional Consensus
 *
 * Queries Supabase for consensus_signals and investor_signals for a ticker,
 * then calls the LLM to interpret what the institutional activity means.
 *
 * execute({ ticker }) -> { consensus, signals, interpretation }
 */

const supabase = require('../../services/supabase');
const { complete } = require('../../services/llm');

const SYSTEM_PROMPT = `You are an institutional flow analyst who tracks 13F filings of super investors
(Berkshire/Abel, Tepper, Druckenmiller, Coleman, Cohen, Tudor Jones, Laffont, Marks, Graham).
Given consensus data and individual investor signals for a stock, provide a concise 3-5 sentence
interpretation covering:
1. The overall institutional sentiment (accumulation vs distribution).
2. Which specific investors are most notable and what their actions signal.
3. Whether this is a high-conviction consensus or a mixed picture.
4. Any warning signs (rapid exits, thesis failures, put hedging).
Be direct and actionable. Reference specific investor names and their known styles.`;

async function execute({ ticker }) {
  if (!ticker) throw new Error('[detect_consensus] ticker is required');

  // Fetch consensus signal for this ticker (latest quarter)
  let consensus = null;
  try {
    const { data, error } = await supabase
      .from('consensus_signals')
      .select('*')
      .eq('ticker', ticker)
      .order('quarter', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[detect_consensus] Consensus query failed for ${ticker}:`, error.message);
    } else {
      consensus = data;
    }
  } catch (err) {
    console.error(`[detect_consensus] Consensus query error for ${ticker}:`, err.message);
  }

  // Fetch individual investor signals (last 2 quarters for trend)
  let signals = [];
  try {
    const { data, error } = await supabase
      .from('investor_signals')
      .select('*, super_investors(name, style)')
      .eq('ticker', ticker)
      .order('quarter', { ascending: false })
      .limit(30);

    if (error) {
      console.error(`[detect_consensus] Signals query failed for ${ticker}:`, error.message);
    } else {
      signals = data || [];
    }
  } catch (err) {
    console.error(`[detect_consensus] Signals query error for ${ticker}:`, err.message);
  }

  // If no data at all, return early with a clear message
  if (!consensus && signals.length === 0) {
    return {
      consensus: null,
      signals: [],
      interpretation: `No institutional signal data found for ${ticker}. This stock may not be held by any of the tracked super investors.`,
    };
  }

  // Build the LLM prompt
  const signalSummary = signals.map(s => {
    const name = s.super_investors?.name || `Investor ${s.investor_id}`;
    const style = s.super_investors?.style || '';
    return `  ${name}${style ? ` (${style})` : ''}: ${s.signal_type} | ${s.pct_change != null ? (s.pct_change > 0 ? '+' : '') + s.pct_change + '% shares' : 'N/A'} | Conviction: ${s.conviction_level || 'N/A'} | Quarter: ${s.quarter}${s.consecutive_quarters_same_direction > 1 ? ` | ${s.consecutive_quarters_same_direction} consecutive quarters same direction` : ''}`;
  }).join('\n');

  let interpretation;
  try {
    const userPrompt = `Ticker: ${ticker}

CONSENSUS (latest quarter):
${consensus ? `  Quarter: ${consensus.quarter}
  Sentiment: ${consensus.net_sentiment}
  Consensus Score: ${consensus.consensus_score} (scale -10 to +10)
  Holders: ${consensus.holders_count}
  New Buyers: ${consensus.new_buyers_count}
  Sellers: ${consensus.sellers_count}` : '  No consensus data available.'}

INDIVIDUAL SIGNALS (recent quarters):
${signalSummary || '  No individual signals found.'}`;

    interpretation = await complete({
      task: 'SIGNAL_EXTRACT',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 600,
    });
  } catch (err) {
    console.error(`[detect_consensus] LLM interpretation failed for ${ticker}:`, err.message);
    const sentiment = consensus?.net_sentiment || 'UNKNOWN';
    const holders = consensus?.holders_count || 0;
    interpretation = `Institutional consensus for ${ticker}: ${sentiment} sentiment with ${holders} tracked holders. LLM interpretation unavailable.`;
  }

  return {
    consensus,
    signals,
    interpretation,
  };
}

module.exports = { execute };
