import { Router } from 'express';
import { supabase } from '../utils/supabase.js';

export const watchlistRouter = Router();

/**
 * GET /api/watchlist
 * Returns watchlist entries joined with latest scores.
 */
watchlistRouter.get('/watchlist', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ success: true, watchlist: [], message: 'Database not configured' });
    }

    const { data: watchlistItems, error } = await supabase
      .from('watchlist')
      .select('*')
      .order('added_at', { ascending: false });

    if (error) throw error;

    // Fetch latest scores for each watchlist ticker
    const tickers = (watchlistItems || []).map((w) => w.ticker);
    let scores = [];

    if (tickers.length > 0) {
      const { data: scoreData } = await supabase
        .from('screener_results')
        .select('*')
        .in('ticker', tickers);
      scores = scoreData || [];
    }

    const scoreMap = Object.fromEntries(scores.map((s) => [s.ticker, s]));

    const enriched = (watchlistItems || []).map((w) => ({
      ...w,
      score_data: scoreMap[w.ticker] || null,
    }));

    res.json({ success: true, watchlist: enriched });
  } catch (err) {
    console.error('[TLI] Watchlist fetch error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch watchlist' });
  }
});

/**
 * POST /api/watchlist
 * Body: { ticker: "AAPL", notes?: "Watching for dip" }
 */
watchlistRouter.post('/watchlist', async (req, res) => {
  try {
    const { ticker, notes } = req.body;
    if (!ticker) {
      return res.status(400).json({ success: false, error: 'Ticker is required' });
    }

    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const { data, error } = await supabase
      .from('watchlist')
      .upsert({ ticker: ticker.toUpperCase().trim(), notes: notes || null }, { onConflict: 'ticker' })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, item: data });
  } catch (err) {
    console.error('[TLI] Watchlist add error:', err);
    res.status(500).json({ success: false, error: 'Failed to add to watchlist' });
  }
});

/**
 * DELETE /api/watchlist/:ticker
 */
watchlistRouter.delete('/watchlist/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase().trim();

    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const { error } = await supabase
      .from('watchlist')
      .delete()
      .eq('ticker', ticker);

    if (error) throw error;

    res.json({ success: true, deleted: ticker });
  } catch (err) {
    console.error('[TLI] Watchlist delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to remove from watchlist' });
  }
});
