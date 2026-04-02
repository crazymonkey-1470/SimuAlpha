import { getQuote, get200WMA, get200MMA } from './marketData.js';
import { getFundamentals } from './fundamentals.js';
import { scoreTicker } from './scoring.js';
import { supabase } from '../utils/supabase.js';

/**
 * Scan a single ticker: fetch all data, score it, return result.
 */
export async function scanTicker(ticker) {
  const symbol = ticker.toUpperCase().trim();

  try {
    // Fetch market data and fundamentals in parallel
    const [quote, wma, mma, fundamentals] = await Promise.all([
      getQuote(symbol),
      get200WMA(symbol),
      get200MMA(symbol),
      getFundamentals(symbol),
    ]);

    if (!quote || !quote.currentPrice) {
      console.warn(`[TLI] No quote data for ${symbol}, skipping`);
      return null;
    }

    const data = {
      currentPrice: quote.currentPrice,
      week52High: quote.week52High,
      price200WMA: wma,
      price200MMA: mma,
      revenueGrowthPct: fundamentals?.revenueGrowthPct ?? null,
      psRatio: fundamentals?.psRatio ?? null,
      peRatio: fundamentals?.peRatio ?? null,
    };

    const scores = scoreTicker(data);

    const result = {
      ticker: symbol,
      company_name: fundamentals?.companyName || quote.shortName,
      sector: fundamentals?.sector || null,
      current_price: quote.currentPrice,
      price_200wma: wma ? Math.round(wma * 100) / 100 : null,
      price_200mma: mma ? Math.round(mma * 100) / 100 : null,
      pct_from_200wma: scores.pctFrom200WMA,
      pct_from_200mma: scores.pctFrom200MMA,
      revenue_current: fundamentals?.revenueCurrent || null,
      revenue_prior_year: fundamentals?.revenuePrior || null,
      revenue_growth_pct: fundamentals?.revenueGrowthPct
        ? Math.round(fundamentals.revenueGrowthPct * 100) / 100
        : null,
      pe_ratio: fundamentals?.peRatio || null,
      ps_ratio: fundamentals?.psRatio || null,
      week_52_high: quote.week52High,
      pct_from_52w_high: scores.pctFrom52wHigh,
      fundamental_score: scores.fundamentalScore,
      technical_score: scores.technicalScore,
      total_score: scores.totalScore,
      signal: scores.signal,
      last_updated: new Date().toISOString(),
    };

    return result;
  } catch (err) {
    console.error(`[TLI] Error scanning ${symbol}:`, err.message);
    return null;
  }
}

/**
 * Scan multiple tickers, store results in Supabase, return sorted results.
 */
export async function scanMultiple(tickers) {
  // Process in batches of 5 to avoid rate limiting
  const results = [];
  const batchSize = 5;

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(scanTicker));
    results.push(...batchResults.filter(Boolean));

    // Small delay between batches to be respectful of rate limits
    if (i + batchSize < tickers.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Store in Supabase if available
  if (supabase && results.length > 0) {
    try {
      // Upsert by ticker
      for (const result of results) {
        await supabase
          .from('screener_results')
          .upsert(result, { onConflict: 'ticker' })
          .select();
      }

      // Record scan history
      const topOpps = results
        .sort((a, b) => b.total_score - a.total_score)
        .slice(0, 5)
        .map((r) => ({ ticker: r.ticker, score: r.total_score, signal: r.signal }));

      await supabase.from('scan_history').insert({
        tickers_scanned: results.length,
        top_opportunities: topOpps,
      });
    } catch (err) {
      console.error('[TLI] Error storing results in Supabase:', err.message);
    }
  }

  // Sort by total score descending
  return results.sort((a, b) => b.total_score - a.total_score);
}

/**
 * Default tickers to pre-scan
 */
export const DEFAULT_TICKERS = [
  'NVO', 'PYPL', 'SE', 'META', 'NIO', 'BABA', 'PINS', 'SNAP', 'SPOT', 'UBER',
  'LYFT', 'ETSY', 'ROKU', 'SHOP', 'PLTR', 'SOFI', 'COIN', 'HOOD', 'AFRM', 'UPST',
  'RIVN', 'LCID', 'XPEV', 'LI', 'DKNG', 'PENN', 'CHWY', 'W', 'CVNA', 'OPEN',
];
