/**
 * Skill: scan_social — Sprint 9A
 *
 * Scans X accounts for investment signals using the X API v2.
 * Extracts structured signals via Haiku and stores in sain_signals.
 */

const { fetchRecentTweets, extractSignal } = require('../../services/x_scanner');
const supabase = require('../../services/supabase');
const log = require('../../services/logger').child({ module: 'scan_social' });

async function execute({ category = 'ALL' }) {
  // Get active X-based sources for this category
  let query = supabase.from('sain_sources').select('*')
    .eq('active', true)
    .eq('scrape_method', 'X_API');
  if (category !== 'ALL') query = query.eq('category', category);

  const { data: sources, error } = await query;
  if (error || !sources) {
    log.error({ err: error }, 'Could not read sain_sources');
    return { signals_found: 0, error: error?.message };
  }

  if (sources.length === 0) {
    // Loud warning — most common root cause of 0 SAIN signals is that
    // scripts/seed_sain_sources.js never ran.
    log.warn({ category }, 'No active X_API sources found in sain_sources — run `node scripts/seed_sain_sources.js` to populate');
    return { signals_found: 0, sources_scanned: 0, reason: 'no_x_sources_seeded' };
  }

  let totalSignals = 0;
  let tweetsFetched = 0;
  let signalsDeduped = 0;
  let insertFailures = 0;
  let authFailures = 0;

  for (const source of sources) {
    if (!source.handle) continue;

    // Fetch tweets since last scan
    const { tweets, status, detail } = await fetchRecentTweets(source.handle, source.last_tweet_id);

    // Even for 0-tweet results, mark the scrape attempt so operators can see
    // the cron is running. This also de-mystifies "last_scraped_at = null"
    // sources that looked like they had never been scanned.
    await supabase.from('sain_sources')
      .update({ last_scraped_at: new Date().toISOString() })
      .eq('id', source.id);

    if (status === 'auth_error') {
      authFailures++;
      // Auth errors are global — every source will fail with the same token.
      // Stop scanning so we don't blow through the rate-limit budget.
      log.error({ handle: source.handle, detail }, 'Aborting social scan — X API auth failed');
      break;
    }

    tweetsFetched += tweets.length;
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
      if (existing && existing.length > 0) {
        signalsDeduped++;
        continue;
      }

      // Store in sain_signals
      const { error: insErr } = await supabase.from('sain_signals').insert({
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
      if (insErr) {
        insertFailures++;
        log.error({ err: insErr, ticker: signal.ticker, source: source.name }, 'sain_signals insert failed');
        continue;
      }
      totalSignals++;
    }

    // Update last_tweet_id so next scan only fetches newer posts
    const newestTweetId = tweets[0]?.id;
    if (newestTweetId) {
      await supabase.from('sain_sources').update({
        last_tweet_id: newestTweetId,
      }).eq('id', source.id);
    }
  }

  const summary = {
    signals_found: totalSignals,
    sources_scanned: sources.length,
    tweets_fetched: tweetsFetched,
    signals_deduped: signalsDeduped,
    insert_failures: insertFailures,
    auth_failures: authFailures,
  };
  log.info(summary, 'Social scan summary');
  return summary;
}

module.exports = { execute };
