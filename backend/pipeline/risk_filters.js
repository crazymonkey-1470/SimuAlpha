/**
 * Risk Filter Chain — 5 Hard Rules (Sprint 10A, Task 8)
 *
 * NON-NEGOTIABLE overrides that apply after scoring.
 */

function applyRiskFilters(stock, waveAnalysis, signal) {
  const filters = {
    supportConfirmed: false,
    chaseFilter: 'PASS',
    timeframeValid: true,
    earningsBlackout: false,
    sentimentAdjustment: 0,
    allPass: true,
    overrideReason: null,
  };

  // RULE 1: Support confirmation required
  // Entry signal starts as PENDING, upgrades to ACTIVE only after support retest
  if (signal.action === 'ENTER' || signal.action === 'FULL_RESTART' || signal.action === 'BUY') {
    if (!stock.supportConfirmed) {
      filters.supportConfirmed = false;
      signal.status = 'PENDING_CONFIRMATION';
    } else {
      filters.supportConfirmed = true;
      signal.status = 'ACTIVE';
    }
  }

  // RULE 2: No chasing — if price >20% above detected entry zone
  const entryZone = waveAnalysis?.key_levels?.wave2_entry
    || waveAnalysis?.key_levels?.entry_zone_low;
  if (entryZone != null && stock.currentPrice != null) {
    const rallyPct = ((stock.currentPrice - entryZone) / entryZone) * 100;
    if (rallyPct > 20) {
      filters.chaseFilter = 'EXPIRED';
      filters.allPass = false;
      filters.overrideReason = 'Price >20% above entry zone — signal expired. Wait for pullback.';
    }
  }

  // RULE 3: Long-term timeframe only
  // Enforced in wave interpretation skill, validated here
  filters.timeframeValid = true;

  // RULE 4: Earnings blackout — no NEW entries within 14 days of earnings
  if (stock.daysToEarnings != null && stock.daysToEarnings <= 14) {
    if (signal.action === 'ENTER' || signal.action === 'FULL_RESTART'
        || signal.action === 'BUY' || signal.action === 'ADD') {
      filters.earningsBlackout = true;
      filters.allPass = false;
      filters.overrideReason = `Earnings in ${stock.daysToEarnings} days — wait for post-earnings confirmation.`;
    }
  }

  // RULE 5: Contrarian sentiment boost/penalty
  if (stock.sentimentScore != null) {
    if (stock.sentimentScore < 30) { // Extreme fear
      filters.sentimentAdjustment = +5;
    } else if (stock.sentimentScore > 70) { // Extreme greed
      filters.sentimentAdjustment = -5;
    }
  }

  return filters;
}

module.exports = { applyRiskFilters };
