/**
 * X API Scanner — Sprint 9A
 *
 * Fetches recent posts from tracked X accounts using the v2 API.
 * Extracts structured investment signals via Haiku.
 */

const { completeJSON } = require('./llm');
const supabase = require('./supabase');

const X_BEARER = process.env.X_BEARER_TOKEN;
const X_API_BASE = 'https://api.x.com/2';

/**
 * Fetch recent tweets from a handle since last scan.
 */
async function fetchRecentTweets(handle, sinceId = null) {
  if (!X_BEARER) {
    console.warn('[SAIN] X_BEARER_TOKEN not set, skipping X scan');
    return [];
  }

  const cleanHandle = handle.replace('@', '');
  const params = new URLSearchParams({
    query: `from:${cleanHandle} -is:retweet`,
    max_results: '10',
    'tweet.fields': 'created_at,text,public_metrics',
    sort_order: 'recency',
  });
  if (sinceId) params.set('since_id', sinceId);

  try {
    const res = await fetch(`${X_API_BASE}/tweets/search/recent?${params}`, {
      headers: { Authorization: `Bearer ${X_BEARER}` },
    });

    if (res.status === 429) {
      console.warn('[SAIN] X API rate limited, will retry next cycle');
      return [];
    }
    if (!res.ok) {
      console.error(`[SAIN] X API ${res.status} for ${cleanHandle}`);
      return [];
    }

    const data = await res.json();
    return data.data || [];
  } catch (err) {
    console.error(`[SAIN] X fetch error for ${cleanHandle}:`, err.message);
    return [];
  }
}

/**
 * Use Haiku to extract a structured investment signal from a tweet.
 * Returns null if the tweet contains no actionable signal.
 */
async function extractSignal(tweetText, sourceType) {
  const result = await completeJSON({
    task: 'SIGNAL_EXTRACT',
    systemPrompt: `You extract investment signals from social media posts for SimuAlpha.

RULES:
- Extract ONLY if the post contains a SPECIFIC stock ticker AND a clear direction (buy/sell)
- If the post is commentary, memes, general market opinion with no specific ticker, return {"has_signal": false}
- A ticker must be a real US stock symbol (not crypto unless it's a crypto ETF)
- Be conservative — when in doubt, return has_signal: false

For POLITICIAN trade posts, extract:
- ticker, direction, politician_name, party (D/R), chamber (HOUSE/SENATE)
- trade_amount_range if mentioned (e.g. "$50K-$100K")

For AI MODEL signal posts, extract:
- ticker, direction, conviction (HIGH/MEDIUM/LOW), brief thesis

For INSIDER TRADE posts, extract:
- ticker, direction, insider_name, insider_title (CEO/CFO/Director)

Return ONLY valid JSON:
{
  "has_signal": true,
  "ticker": "AAPL",
  "direction": "BUY",
  "conviction": "HIGH",
  "politician_name": null,
  "politician_party": null,
  "politician_chamber": null,
  "trade_amount_range": null,
  "ai_model_name": null,
  "insider_name": null,
  "insider_title": null,
  "thesis_summary": null
}`,
    userPrompt: `Source type: ${sourceType}\nPost text: "${tweetText}"`,
    maxTokens: 500,
  });

  if (!result || !result.has_signal) return null;
  return result;
}

module.exports = { fetchRecentTweets, extractSignal };
