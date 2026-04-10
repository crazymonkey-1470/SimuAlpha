/**
 * Margin of Safety — Sprint 10B (Graham)
 *
 * Computes the margin of safety as the percentage difference
 * between intrinsic value and current price. A >10% MoS is
 * required for a Buy recommendation per Graham's principles.
 */

function computeMarginOfSafety(intrinsicValue, currentPrice) {
  if (!intrinsicValue || intrinsicValue <= 0) return null;

  const mos = ((intrinsicValue - currentPrice) / intrinsicValue) * 100;

  return {
    marginOfSafety: Math.round(mos * 100) / 100,
    meetsThreshold: mos > 10,
    recommendation: mos > 15 ? 'STRONG_MOS' : (mos > 10 ? 'ADEQUATE_MOS' : 'INSUFFICIENT_MOS'),
  };
}

module.exports = { computeMarginOfSafety };
