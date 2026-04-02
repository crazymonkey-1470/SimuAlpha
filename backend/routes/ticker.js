import { Router } from 'express';
import { scanTicker } from '../services/scanner.js';
import { supabase } from '../utils/supabase.js';

export const tickerRouter = Router();

/**
 * GET /api/ticker/:symbol
 * Deep dive on a single ticker — returns all metrics + scoring breakdown.
 */
tickerRouter.get('/ticker/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase().trim();

    // Try cached result first
    if (supabase) {
      const { data } = await supabase
        .from('screener_results')
        .select('*')
        .eq('ticker', symbol)
        .single();

      // If cached and less than 1 hour old, return it
      if (data && data.last_updated) {
        const age = Date.now() - new Date(data.last_updated).getTime();
        if (age < 3600000) {
          return res.json({ success: true, result: data, cached: true });
        }
      }
    }

    // Fresh scan
    const result = await scanTicker(symbol);
    if (!result) {
      return res.status(404).json({ success: false, error: `No data found for ${symbol}` });
    }

    // Store in Supabase
    if (supabase) {
      await supabase
        .from('screener_results')
        .upsert(result, { onConflict: 'ticker' });
    }

    res.json({ success: true, result, cached: false });
  } catch (err) {
    console.error(`[TLI] Ticker lookup error:`, err);
    res.status(500).json({ success: false, error: 'Ticker lookup failed' });
  }
});
