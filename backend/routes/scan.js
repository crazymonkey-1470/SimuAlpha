import { Router } from 'express';
import { scanMultiple, DEFAULT_TICKERS } from '../services/scanner.js';

export const scanRouter = Router();

/**
 * POST /api/scan
 * Body: { tickers: ["AAPL", "MSFT", ...] }
 * If no tickers provided, uses default watchlist.
 */
scanRouter.post('/scan', async (req, res) => {
  try {
    const tickers = req.body.tickers && req.body.tickers.length > 0
      ? req.body.tickers
      : DEFAULT_TICKERS;

    // Limit to 50 tickers per scan
    const limitedTickers = tickers.slice(0, 50);

    console.log(`[TLI] Starting scan of ${limitedTickers.length} tickers...`);
    const results = await scanMultiple(limitedTickers);
    console.log(`[TLI] Scan complete. ${results.length} results.`);

    res.json({
      success: true,
      count: results.length,
      results,
    });
  } catch (err) {
    console.error('[TLI] Scan error:', err);
    res.status(500).json({ success: false, error: 'Scan failed' });
  }
});
