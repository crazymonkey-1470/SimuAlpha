/**
 * Skill: scan_social — Sprint 9A
 *
 * Scans X accounts for investment signals using the X API v2.
 * Extracts structured signals via Haiku and stores in sain_signals.
 */

const { fetchRecentTweets, extractSignal } = require('../../services/x_scanner');
const supabase = require('../../services/supabase');

async function execute({ category = 'ALL' }) {
  // Get active X-based sources for this category
  let query = supabase.from('sain_sources').select('*')
    .eq('active', true)
    .eq('scrape_method', 'X_API');
  if (category !== 'ALL') query = query.eq('category', category);

  const { data: sources, error } = await query;
  if (error || !sources) return { signals_found: 0, error: error?.message };

  let totalSignals = 0;

  for (const source of sources) {
    if (!source.handle) continue;

    // Fetch tweets since last scan
    const tweets = await fetchRecentTweets(source.handle, source.last_tweet_id);
    if (tweets.length === 0) continue;

    // Extract signals from each tweet
    for (const tweet of tweets) {
      const signal = await extractSignal(tweet.text, source.source_type);
      if (!signal) continue;

      // Deduplication: skip if same source + ticker + date already exists
      const signalDate = tweet.created_at ? tweet.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
      const { data: existing } = await supabase.from('sain_signals')
        .select('id')
        .eq('source_id', source.id)
        .eq('ticker', signal.ticker)
        .gte('signal_date', signalDate + 'T00:00:00Z')
        .lte('signal_date', signalDate + 'T23:59:59Z')
        .limit(1);
      if (existing && existing.length > 0) continue;

      // Store in sain_signals
      await supabase.from('sain_signals').insert({
        source_id: source.id,
        ticker: signal.ticker,
        direction: signal.direction,
        conviction: signal.conviction || 'MEDIUM',
        signal_date: tweet.created_at || new Date().toISOString(),
        politician_name: signal.politician_name,
        politician_party: signal.politician_party,
        politician_chamber: signal.politician_chamber,
        trade_amount_range: signal.trade_amount_range,
        ai_model_name: signal.ai_model_name || source.name,
        insider_name: signal.insider_name,
        insider_title: signal.insider_title,
        thesis_summary: signal.thesis_summary,
        raw_text: tweet.text,
        source_url: `https://x.com/i/status/${tweet.id}`,
        quality_score: source.priority === 'CRITICAL' ? 0.9 : 0.7,
      });
      totalSignals++;
    }

    // Update last_tweet_id and last_scraped_at
    const newestTweetId = tweets[0]?.id;
    if (newestTweetId) {
      await supabase.from('sain_sources').update({
        last_tweet_id: newestTweetId,
        last_scraped_at: new Date().toISOString(),
      }).eq('id', source.id);
    }
  }

  return { signals_found: totalSignals, sources_scanned: sources.length };
}

module.exports = { execute };
