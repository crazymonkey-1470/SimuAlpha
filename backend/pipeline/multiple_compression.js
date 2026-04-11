/**
 * Multiple Compression Detector — Sprint 10B
 *
 * Detects when a stock's EV/Sales multiple has compressed >30%
 * below its 5-year historical average while revenue is still growing.
 * This is a classic deep value signal. Conversely, >30% above
 * historical signals overvaluation.
 */

function detectMultipleCompression(stock) {
  if (!stock.evSales5YrAvg || !stock.currentEVSales) return null;

  const compressionPct = ((stock.currentEVSales - stock.evSales5YrAvg) / stock.evSales5YrAvg) * 100;

  if (compressionPct < -30 && stock.revenueGrowthYoY > 0) {
    return {
      signal: 'DEEP_VALUE',
      compressionPct,
      note: 'Multiple >30% below historical + revenue growing = Strong Buy candidate',
    };
  }

  if (compressionPct > 30) {
    return {
      signal: 'OVERVALUED',
      compressionPct,
      note: 'Multiple >30% above historical = Reduce candidate',
    };
  }

  return { signal: 'NORMAL', compressionPct };
}

module.exports = { detectMultipleCompression };
