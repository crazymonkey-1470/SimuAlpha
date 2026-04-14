/**
 * X API Scanner — Sprint 9A
 *
 * Fetches recent posts from tracked X accounts using the v2 API.
 * Extracts structured investment signals via Haiku (with regex fallback).
 */

const { completeJSON } = require('./llm');
const supabase = require('./supabase');
const log = require('./logger').child({ module: 'x_scanner' });

const X_BEARER = process.env.X_BEARER_TOKEN;
const X_API_BASE = 'https://api.x.com/2';

/**
 * Fetch recent tweets from a handle since last scan.
 * Returns { tweets: [], status: 'ok'|'auth_error'|'rate_limit'|'fetch_error'|'no_token', detail? }
 */
async function fetchRecentTweets(handle, sinceId = null) {
  if (!X_BEARER) {
    log.warn('X_BEARER_TOKEN not set, skipping X scan');
    return { tweets: [], status: 'no_token' };
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
      log.warn({ handle: cleanHandle }, 'X API rate limited, will retry next cycle');
      return { tweets: [], status: 'rate_limit' };
    }
    if (res.status === 401 || res.status === 403) {
      // Surface the response body so operators can tell "invalid token" from
      // "access tier too low" — the previous silent failure left sain_signals
      // empty for every X source with no actionable signal in logs.
      const body = await safeReadBody(res);
      log.error({ status: res.status, handle: cleanHandle, body }, 'X API auth/forbidden — check X_BEARER_TOKEN access tier (recent-search requires Basic or higher)');
      return { tweets: [], status: 'auth_error', detail: body };
    }
    if (!res.ok) {
      const body = await safeReadBody(res);
      log.error({ status: res.status, handle: cleanHandle, body }, 'X API request failed');
      return { tweets: [], status: 'fetch_error', detail: body };
    }

    const data = await res.json();
    return { tweets: data.data || [], status: 'ok' };
  } catch (err) {
    log.error({ err, handle: cleanHandle }, 'X fetch error');
    return { tweets: [], status: 'fetch_error', detail: err.message };
  }
}

async function safeReadBody(res) {
  try { return (await res.text()).slice(0, 500); } catch (_) { return null; }
}

/**
 * Use Haiku to extract a structured investment signal from a tweet.
 * Falls back to a regex cashtag extractor when Claude returns nothing so
 * sain_signals still gets populated when the LLM is down / rate-limited /
 * ANTHROPIC_API_KEY is unset. Returns null if the tweet has no signal.
 */
async function extractSignal(tweetText, sourceType) {
  let result = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      result = await completeJSON({
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
    } catch (err) {
      log.warn({ err: err.message }, 'Claude extract failed — falling back to regex');
    }
  }

  if (result && result.has_signal) return result;

  // Fallback: cashtag + direction keyword extraction.
  return regexExtractSignal(tweetText);
}

/**
 * Best-effort extraction without Claude.
 * Matches $TICKER cashtags and a buy/sell keyword near them.
 * Conservative: require BOTH a cashtag AND a direction word.
 */
const BUY_WORDS  = /\b(buy|buying|bought|bullish|long|accumulate|adding|load|entry|scale in)\b/i;
const SELL_WORDS = /\b(sell|selling|sold|bearish|short|trim|exit|dump|taking profits)\b/i;
// Cashtag: $ followed by 1-5 uppercase letters, not preceded by word char (avoids prices like "$50")
const CASHTAG_RE = /(?<![A-Za-z0-9])\$([A-Z]{1,5})(?:\.[A-Z]{1,2})?\b/g;

function regexExtractSignal(text) {
  if (!text) return null;
  const tickers = new Set();
  let m;
  while ((m = CASHTAG_RE.exec(text)) !== null) {
    // Filter out false positives: common words that happen to be 1-5 uppercase
    const t = m[1];
    if (t.length >= 1 && t.length <= 5 && !/^(USD|EUR|GBP|JPY|BTC|ETH)$/.test(t)) {
      tickers.add(t);
    }
  }
  if (tickers.size === 0) return null;

  const hasBuy = BUY_WORDS.test(text);
  const hasSell = SELL_WORDS.test(text);
  if (!hasBuy && !hasSell) return null;
  // Ambiguous if both appear — skip to avoid wrong direction
  if (hasBuy && hasSell) return null;

  // First ticker gets the directional tag. If the tweet mentions multiple,
  // the LLM path would have been the better extractor; keep the regex
  // conservative to avoid bogus "BUY" on a tweet like "$AAPL up but $MSFT down".
  if (tickers.size > 1) return null;

  return {
    has_signal: true,
    ticker: [...tickers][0],
    direction: hasBuy ? 'BUY' : 'SELL',
    conviction: 'MEDIUM',
    politician_name: null,
    politician_party: null,
    politician_chamber: null,
    trade_amount_range: null,
    ai_model_name: null,
    insider_name: null,
    insider_title: null,
    thesis_summary: null,
    _extractor: 'regex',
  };
}

module.exports = { fetchRecentTweets, extractSignal, regexExtractSignal };
