/**
 * X (Twitter) Posting Engine — SimuAlpha
 *
 * Posts daily signals, wave counts, and market commentary
 * pulled from the SimuAlpha scoring pipeline.
 *
 * Post types:
 *   1. Daily Signal Scan — top signals of the day
 *   2. Spotlight — deep dive on one high-conviction ticker
 *   3. Wave Alert — specific wave count update
 *   4. Market Context — macro risk / sentiment
 */

const supabase = require('./supabase');
const log = require('./logger').child({ module: 'x_poster' });

let twitterClient = null;

function getClient() {
  if (twitterClient) return twitterClient;
  try {
    const { TwitterApi } = require('twitter-api-v2');
    twitterClient = new TwitterApi({
      appKey: process.env.X_CONSUMER_KEY,
      appSecret: process.env.X_CONSUMER_KEY_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });
    return twitterClient;
  } catch (e) {
    log.error({ err: e }, 'Failed to init Twitter client — is twitter-api-v2 installed?');
    return null;
  }
}

/**
 * Post a tweet. Returns the tweet ID or null on failure.
 */
async function post(text) {
  const client = getClient();
  if (!client) return null;

  try {
    const tweet = await client.v2.tweet(text);
    log.info({ tweetId: tweet.data.id, text: text.slice(0, 60) }, 'Tweet posted');
    return tweet.data.id;
  } catch (e) {
    log.error({ err: e, text: text.slice(0, 60) }, 'Tweet failed');
    return null;
  }
}

/**
 * Signal emoji by tier
 */
function signalEmoji(signal) {
  if (!signal) return '⚪';
  const s = signal.toUpperCase();
  if (s.includes('GENERATIONAL')) return '🔵';
  if (s.includes('CONFLUENCE')) return '🟣';
  if (s.includes('FULL_STACK') || s.includes('FULL STACK')) return '🏆';
  if (s.includes('LOAD')) return '🔴';
  if (s.includes('STRONG_BUY') || s.includes('STRONG BUY')) return '🟢';
  if (s.includes('BUY') || s.includes('ACCUMULATE')) return '🟢';
  if (s.includes('WATCH') || s.includes('WATCHLIST')) return '👀';
  return '⚪';
}

function formatSignalName(signal) {
  if (!signal) return 'WATCH';
  return signal.replace(/_/g, ' ').toUpperCase();
}

function formatPrice(price) {
  if (!price) return 'N/A';
  return `$${Number(price).toFixed(2)}`;
}

function formatUpside(pct) {
  if (pct == null) return null;
  return pct >= 0 ? `+${Math.round(pct)}%` : `${Math.round(pct)}%`;
}

/**
 * POST TYPE 1: Daily Signal Scan
 * Posts the top signals from the pipeline. Runs at 9am ET.
 */
async function postDailySignalScan() {
  const { data: topSignals } = await supabase
    .from('screener_results')
    .select('ticker, company_name, signal, total_score, current_price, price_200wma')
    .in('signal', ['LOAD_THE_BOAT', 'LOAD THE BOAT', 'CONFLUENCE_ZONE', 'GENERATIONAL_BUY', 'FULL_STACK_CONSENSUS'])
    .order('total_score', { ascending: false })
    .limit(5);

  if (!topSignals || topSignals.length === 0) {
    log.warn('No top signals found for daily scan post');
    return null;
  }

  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  let text = `📊 SimuAlpha Signal Scan — ${date}\n\n`;

  for (const s of topSignals.slice(0, 4)) {
    const emoji = signalEmoji(s.signal);
    const pctFrom200w = s.price_200wma && s.current_price
      ? `${(((s.current_price - s.price_200wma) / s.price_200wma) * 100).toFixed(1)}% from 200WMA`
      : null;
    text += `${emoji} $${s.ticker} — ${formatSignalName(s.signal)}\n`;
    if (pctFrom200w) text += `   ${pctFrom200w} | Score: ${s.total_score}/100\n`;
    text += '\n';
  }

  text += `Full analysis at simualpha.com\n\nNot financial advice. DYOR.`;

  if (text.length > 280) text = text.slice(0, 277) + '...';
  return await post(text);
}

/**
 * POST TYPE 2: Spotlight — Deep dive on one ticker
 * Posts the highest-conviction stock with wave + valuation context.
 */
async function postSpotlight() {
  // Get top scoring stock with valuation data
  const { data: candidates } = await supabase
    .from('screener_results')
    .select('ticker, company_name, signal, total_score, current_price, price_200wma, price_200mma')
    .in('signal', ['LOAD_THE_BOAT', 'LOAD THE BOAT', 'CONFLUENCE_ZONE', 'GENERATIONAL_BUY'])
    .order('total_score', { ascending: false })
    .limit(10);

  if (!candidates || candidates.length === 0) return null;

  // Pick one that hasn't been spotlighted recently
  const { data: recentPosts } = await supabase
    .from('x_post_log')
    .select('ticker')
    .eq('post_type', 'spotlight')
    .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .limit(20);

  const recentTickers = new Set((recentPosts || []).map(p => p.ticker));
  const stock = candidates.find(c => !recentTickers.has(c.ticker)) || candidates[0];

  // Get valuation
  const { data: val } = await supabase
    .from('stock_valuations')
    .select('avg_price_target, avg_upside_pct, tli_rating')
    .eq('ticker', stock.ticker)
    .order('computed_date', { ascending: false })
    .limit(1)
    .single();

  // Get wave analysis
  const { data: wave } = await supabase
    .from('wave_counts')
    .select('wave_count_json, claude_interpretation')
    .eq('ticker', stock.ticker)
    .order('last_updated', { ascending: false })
    .limit(1)
    .single();

  const wavePos = wave?.wave_count_json?.current_wave || null;
  const upside = val ? formatUpside(val.avg_upside_pct) : null;
  const target = val?.avg_price_target ? formatPrice(val.avg_price_target) : null;

  const emoji = signalEmoji(stock.signal);
  let text = `${emoji} SPOTLIGHT: $${stock.ticker}\n\n`;
  text += `Signal: ${formatSignalName(stock.signal)}\n`;
  text += `Score: ${stock.total_score}/100\n`;
  text += `Price: ${formatPrice(stock.current_price)}\n`;
  if (wavePos) text += `Wave: ${wavePos}\n`;
  if (target) text += `Target: ${target}`;
  if (upside) text += ` (${upside} upside)\n`;
  text += `\n`;

  if (stock.price_200wma && stock.current_price) {
    const pct = ((stock.current_price - stock.price_200wma) / stock.price_200wma * 100).toFixed(1);
    const direction = pct >= 0 ? 'above' : 'below';
    text += `Trading ${Math.abs(pct)}% ${direction} the 200WMA\n\n`;
  }

  text += `Not financial advice. DYOR.\n#TLI #ElliottWave #StockMarket`;

  if (text.length > 280) text = text.slice(0, 277) + '...';

  const tweetId = await post(text);

  // Log the post
  if (tweetId) {
    await supabase.from('x_post_log').insert({
      ticker: stock.ticker,
      post_type: 'spotlight',
      tweet_id: tweetId,
      content: text,
    }).catch(() => {});
  }

  return tweetId;
}

/**
 * POST TYPE 3: Market Context
 * Posts current macro risk level and what it means.
 */
async function postMarketContext() {
  const { data: macro } = await supabase
    .from('macro_context')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!macro) return null;

  const riskEmoji = {
    GREEN: '🟢',
    YELLOW: '🟡',
    ORANGE: '🟠',
    RED: '🔴',
  }[macro.market_risk_level] || '⚪';

  let text = `${riskEmoji} Market Risk: ${macro.market_risk_level}\n\n`;
  text += `VIX: ${macro.vix} | S&P P/E: ${macro.sp500_pe}x\n`;
  text += `DXY: ${macro.dxy_index} | Fed Rate: ${macro.fed_rate}%\n`;
  if (macro.late_cycle_score >= 3) {
    text += `\n⚠️ Late-cycle signals elevated (${macro.late_cycle_score}/12)\n`;
  }
  text += `\nAlways size positions accordingly.\n\nNot financial advice. DYOR.`;

  if (text.length > 280) text = text.slice(0, 277) + '...';
  return await post(text);
}

/**
 * POST TYPE 4: Pipeline Update
 * Posted after each pipeline run to announce fresh scores.
 */
async function postPipelineUpdate(stocksScored) {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const text = `🔄 SimuAlpha pipeline just ran (${date})\n\n${stocksScored} stocks re-scored through the TLI Elliott Wave engine.\n\nFresh signals, updated wave counts, and new institutional data live now.\n\nsimualpha.com\n\nNot financial advice. DYOR.`;
  return await post(text.slice(0, 280));
}

module.exports = {
  post,
  postDailySignalScan,
  postSpotlight,
  postMarketContext,
  postPipelineUpdate,
};
