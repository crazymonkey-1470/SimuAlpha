/**
 * Lynch Classification Engine — Sprint 10B
 *
 * Classifies stocks into Peter Lynch's 6 categories:
 * Fast Grower, Stalwart, Slow Grower, Cyclical, Turnaround, Asset Play
 *
 * Also detects category migration (e.g. Fast Grower → Stalwart)
 * which triggers rotation alerts.
 */

function classifyLynch(stock) {
  const epsGrowth = stock.epsGrowthYoY || 0;
  const epsGrowth5Yr = stock.epsGrowth5Yr || 0;
  const netIncome = stock.netIncome || 0;
  const revenueGrowth = stock.revenueGrowthYoY || 0;

  // Turnaround: was losing money, now profitable
  if (stock.netIncomePriorYear < 0 && netIncome > 0) {
    return {
      category: 'TURNAROUND',
      holdPeriod: 'Until recovery completes',
      expectedReturn: '5-15x if successful',
      sellTrigger: 'Story shifts from recovery to stagnation',
      allocation: '5-10%',
    };
  }

  // Fast Grower: EPS growth >20%
  if (epsGrowth >= 20 || epsGrowth5Yr >= 20) {
    return {
      category: 'FAST_GROWER',
      holdPeriod: '5-10 years',
      expectedReturn: '10-bagger potential',
      sellTrigger: 'Growth slows 2+ consecutive quarters',
      allocation: '30-40%',
    };
  }

  // Stalwart: EPS growth 10-20%
  if (epsGrowth >= 10 || epsGrowth5Yr >= 10) {
    return {
      category: 'STALWART',
      holdPeriod: '1-3 years',
      expectedReturn: '30-50% gain then rotate',
      sellTrigger: 'Sell at 30-50% gain',
      allocation: '20-30%',
    };
  }

  // Slow Grower: EPS growth 2-10%
  if (epsGrowth >= 2) {
    return {
      category: 'SLOW_GROWER',
      holdPeriod: 'Avoid or income only',
      expectedReturn: 'Dividend yield only',
      sellTrigger: 'Lynch says avoid',
      allocation: '0%',
    };
  }

  // Cyclical: variable growth, check sector
  const cyclicalSectors = ['Energy', 'Materials', 'Industrials', 'Real Estate'];
  if (cyclicalSectors.includes(stock.sector)) {
    return {
      category: 'CYCLICAL',
      holdPeriod: 'Timing-dependent',
      expectedReturn: 'High if timed right',
      sellTrigger: 'Industry cycle peaks',
      allocation: '10-20%',
    };
  }

  return {
    category: 'UNCLASSIFIED',
    holdPeriod: 'Review needed',
    expectedReturn: 'Unknown',
    sellTrigger: 'N/A',
    allocation: 'N/A',
  };
}

// Migration detection: track EPS growth over 4 quarters
function detectMigration(stock) {
  // If Fast Grower's growth declined <15% for 2+ quarters → migrating to Stalwart
  if (stock.lynchCategory === 'FAST_GROWER') {
    if (stock.epsGrowthYoY < 15 && stock.epsGrowthPriorQoQ < 15) {
      return {
        migrating: true,
        from: 'FAST_GROWER',
        to: 'STALWART',
        alert: 'Growth slowing — consider taking profits and rotating into next Fast Grower',
      };
    }
  }

  // If Stalwart achieved 30-50% gain → rotation signal
  if (stock.lynchCategory === 'STALWART' && stock.gainFromEntry > 30) {
    return {
      migrating: false,
      rotationSignal: true,
      alert: `Stalwart up ${stock.gainFromEntry.toFixed(0)}% — rotate to underappreciated peers`,
    };
  }

  return { migrating: false };
}

module.exports = { classifyLynch, detectMigration };
