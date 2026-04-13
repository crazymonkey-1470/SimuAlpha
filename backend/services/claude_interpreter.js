require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const log = require('./logger').child({ module: 'claude_interpreter' });

// Validate model ID — must start with "claude-" to catch garbled env vars
const envModel = process.env.CLAUDE_MODEL;
const MODEL = (envModel && envModel.startsWith('claude-')) ? envModel : 'claude-haiku-4-5-20251001';

// Lazy-init client only when API key is present (avoids crash at module load)
let _client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/**
 * SMART TRIGGER CHECK
 * Only call Claude if:
 * 1. No interpretation exists yet
 * 2. Signal changed since last interpretation
 * 3. Wave position changed
 * 4. Last interpretation older than 7 days
 */
function shouldInterpret(waveCount, previousWaveCount) {
  // No previous wave count means first interpretation
  if (!previousWaveCount) return true;

  // Check if previous interpretation is stale (>7 days old)
  if (!previousWaveCount.claude_interpreted_at) return true;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (new Date(previousWaveCount.claude_interpreted_at) < sevenDaysAgo) return true;

  // Re-interpret if signal, wave position, or confidence changed
  if (waveCount.tli_signal !== previousWaveCount.tli_signal) return true;
  if (waveCount.current_wave !== previousWaveCount.current_wave) return true;
  if (waveCount.confidence_label !== previousWaveCount.confidence_label) return true;

  return false;
}

/**
 * MAIN INTERPRETATION FUNCTION
 * Sends wave count + fundamentals + backtest to Claude.
 * Returns structured JSON interpretation.
 */
async function interpretWaveCount(ticker, waveData, fundamentals, backtest) {
  const prompt = `You are an expert Elliott Wave analyst strictly following
The Long Investor (TLI) methodology for long-term investing.

TLI CORE RULES (never violate these in your analysis):
- Only buy fundamentally undervalued stocks
- Best entries: Wave 2 completion, Wave 4 completion, Wave C completion
- NEVER recommend buying in Wave 5 (first deadly sin)
- NEVER recommend chasing a move already in progress (second deadly sin)
- Wave B is exit liquidity — never buy Wave B
- Price must be at or near 200WMA or 200MMA to be a valid TLI entry
- Always think in 2-5 year time horizons
- Scale into positions in thirds, never go all-in at once
- Revenue growth is the fundamental backbone — declining revenue = no entry

CURRENT SETUP TO ANALYZE:

Ticker: ${ticker}
Company: ${fundamentals.company_name}
Sector: ${fundamentals.sector}

WAVE COUNT:
Structure: ${waveData.wave_structure} (impulse = 5 waves, corrective = A-B-C)
Timeframe: ${waveData.timeframe}
Degree: ${waveData.wave_degree}
Current Wave: ${waveData.current_wave}
Confidence: ${waveData.confidence_score}% — ${waveData.confidence_label}
TLI Signal: ${waveData.tli_signal}
System Reason: ${waveData.tli_signal_reason || 'N/A'}

FIBONACCI LEVELS:
Entry Zone: $${waveData.entry_zone_low || 'N/A'} — $${waveData.entry_zone_high || 'N/A'}
Stop Loss: $${waveData.stop_loss || 'N/A'} (invalidation level)
Target 1: $${waveData.target_1 || 'N/A'}
Target 2: $${waveData.target_2 || 'N/A'}
Reward/Risk: ${waveData.reward_risk_ratio || 'N/A'}x

FUNDAMENTAL PICTURE:
TLI Score: ${fundamentals.total_score ?? 'N/A'}/100 (${fundamentals.signal || 'N/A'})
Current Price: ${fundamentals.current_price != null ? '$' + fundamentals.current_price : 'UNAVAILABLE'}
200 Weekly MA: ${fundamentals.price_200wma != null ? '$' + fundamentals.price_200wma : 'UNAVAILABLE'} (${fundamentals.pct_from_200wma != null ? fundamentals.pct_from_200wma + '% away' : 'N/A'})
200 Monthly MA: ${fundamentals.price_200mma != null ? '$' + fundamentals.price_200mma : 'UNAVAILABLE'} (${fundamentals.pct_from_200mma != null ? fundamentals.pct_from_200mma + '% away' : 'N/A'})
Revenue (current): ${fundamentals.revenue_current != null ? '$' + fundamentals.revenue_current : 'UNAVAILABLE'}
Revenue (prior yr): ${fundamentals.revenue_prior_year != null ? '$' + fundamentals.revenue_prior_year : 'UNAVAILABLE'}
Revenue Growth: ${fundamentals.revenue_growth_pct != null ? fundamentals.revenue_growth_pct + '%' : 'UNAVAILABLE'}
P/E Ratio: ${fundamentals.pe_ratio != null ? fundamentals.pe_ratio : 'N/A'}
P/S Ratio: ${fundamentals.ps_ratio != null ? fundamentals.ps_ratio : 'N/A'}
52-Week High: ${fundamentals.week_52_high != null ? '$' + fundamentals.week_52_high : 'UNAVAILABLE'}
% From 52W High: ${fundamentals.pct_from_52w_high != null ? fundamentals.pct_from_52w_high + '%' : 'UNAVAILABLE'}

NOTE: Fields marked "UNAVAILABLE" mean data is missing. Do NOT fabricate values for unavailable fields. State clearly if data is insufficient for a recommendation.

BACKTEST HISTORY (how this pattern performed historically):
Total Historical Signals: ${backtest?.total_signals || 'Insufficient data'}
Win Rate: ${backtest?.win_rate_pct || 'N/A'}%
Avg Return: ${backtest?.avg_return_pct || 'N/A'}%
Avg Hold Period: ${backtest?.avg_hold_days || 'N/A'} days
vs S&P 500: ${backtest?.vs_spy_pct || 'N/A'}% outperformance
Best Signal: +${backtest?.best_return_pct || 'N/A'}%
Worst Signal: ${backtest?.worst_return_pct || 'N/A'}%

Respond ONLY with a valid JSON object. No preamble, no markdown,
no backticks. Just the raw JSON:

{
  "conviction": "HIGH" or "MEDIUM" or "LOW",
  "summary": "2-3 sentences. What is this setup in plain english. Why does it matter. What is the market doing here.",
  "entry_guidance": "Specific TLI-style entry guidance. Reference the exact price levels. Mention the thirds scaling approach if appropriate.",
  "confirmation_signals": "What specific price action would confirm this wave count is playing out correctly.",
  "invalidation": "The exact level and condition that would invalidate this setup. Be specific with prices.",
  "risk_factors": "2-3 specific risks to this setup. Not generic risks — risks specific to this ticker and wave count.",
  "tli_alignment": "How well does this align with TLI methodology 1-10 and why. Call out any conflicts between wave position and TLI rules.",
  "one_liner": "One punchy sentence. The kind TLI would post on X. Max 15 words."
}`;

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      ...parsed,
      model_used: MODEL,
      interpreted_at: new Date().toISOString(),
    };
  } catch (error) {
    log.error({ err: error, ticker }, 'Claude interpretation failed');
    return {
      conviction: null,
      summary: 'Interpretation unavailable.',
      entry_guidance: 'See Fibonacci levels above.',
      confirmation_signals: 'Monitor price action at entry zone.',
      invalidation: `Below stop loss at $${waveData.stop_loss}`,
      risk_factors: 'See fundamental and technical data above.',
      tli_alignment: 'N/A',
      one_liner: 'Analysis pending.',
      model_used: MODEL,
      interpreted_at: new Date().toISOString(),
      error: true,
    };
  }
}

/**
 * ALERT NARRATIVE GENERATOR
 * Called when a Telegram alert is about to fire.
 * Returns a 2-3 sentence narrative for the alert message.
 */
async function generateAlertNarrative(ticker, waveData, fundamentals, alertType) {
  const prompt = `You are writing a Telegram alert for a stock signal
following TLI (The Long Investor) methodology.

Write exactly 2-3 sentences. Direct. No fluff.
The audience is a serious long-term investor who understands Elliott Wave.
Do not start with "I" or "This stock". Start with the ticker or the situation.
Sound like TLI posting on X — confident, precise, no hype.

Alert Type: ${alertType}
Ticker: ${ticker}
Company: ${fundamentals.company_name}
Signal: ${waveData.tli_signal}
Current Wave: ${waveData.current_wave} (${waveData.wave_structure})
Confidence: ${waveData.confidence_label}
TLI Score: ${fundamentals.total_score}/100
Revenue Growth: ${fundamentals.revenue_growth_pct}%
Price vs 200WMA: ${fundamentals.pct_from_200wma}%
Price vs 200MMA: ${fundamentals.pct_from_200mma}%
Entry Zone: $${waveData.entry_zone_low || 'N/A'} — $${waveData.entry_zone_high || 'N/A'}
R/R Ratio: ${waveData.reward_risk_ratio || 'N/A'}x
Conviction from wave analysis: ${waveData.confidence_label}

Respond with ONLY the narrative text. No JSON. No quotes. Just the sentences.`;

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0].text.trim();
  } catch (error) {
    log.error({ err: error, ticker }, 'Alert narrative failed');
    return `${ticker} has entered a TLI buy zone. Score: ${fundamentals.total_score}/100. R/R: ${waveData.reward_risk_ratio}x.`;
  }
}

/**
 * WEEKLY BRIEF GENERATOR
 * Called every Sunday by cron.
 * Summarizes the week's top opportunities and signals.
 */
async function generateWeeklyBrief(topOpportunities, recentAlerts) {
  const prompt = `You are writing a weekly investor brief following
TLI (The Long Investor) methodology.

Tone: professional, direct, data-driven.
No hype. No generic market commentary.
Focus on actionable setups and what changed this week.
Write in sections exactly as structured below.

TOP OPPORTUNITIES THIS WEEK:
${JSON.stringify(topOpportunities, null, 2)}

SIGNALS FIRED THIS WEEK:
${JSON.stringify(recentAlerts, null, 2)}

Write the brief in this exact structure:

WEEKLY BRIEF — [current date]

THE SETUP COUNT
[One sentence: how many LOAD THE BOAT and ACCUMULATE setups exist right now]

TOP 3 OPPORTUNITIES
[For each: ticker, one sentence on why it qualifies per TLI methodology,
entry zone, key target]

SIGNALS THIS WEEK
[Summary of any alerts that fired. What happened after.]

WHAT TO WATCH
[2-3 setups approaching entry zones but not there yet]

DISCIPLINE REMINDER
[One sentence. A TLI principle relevant to current market conditions.]`;

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0].text.trim();
  } catch (error) {
    log.error({ err: error }, 'Weekly brief generation failed');
    return null;
  }
}

module.exports = {
  interpretWaveCount,
  generateAlertNarrative,
  generateWeeklyBrief,
  shouldInterpret,
};
