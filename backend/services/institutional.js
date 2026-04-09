/**
 * Institutional Intelligence Service
 *
 * Manages super investor data: fetches 13F filings via scraper,
 * computes quarterly signals, generates consensus scores.
 */

const supabase = require('./supabase');
const { sleep } = require('./fetcher');

const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:8000';

/**
 * Fetch all tracked super investors from the database.
 */
async function getInvestors() {
  const { data, error } = await supabase
    .from('super_investors')
    .select('*')
    .order('name');
  if (error) console.error('[Institutional] Failed to fetch investors:', error.message);
  return data || [];
}

/**
 * Fetch latest 13F filing for a single investor via the scraper service.
 */
async function fetch13F(cik) {
  try {
    const res = await fetch(`${SCRAPER_URL}/institutional/13f/${cik}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[Institutional] 13F fetch failed for CIK ${cik}:`, err.message);
    return null;
  }
}

/**
 * Refresh holdings for all 8 super investors.
 * Fetches latest 13F, upserts holdings, computes signals.
 */
async function refreshAllInvestors() {
  console.log('\n[Institutional] Refreshing super investor data...');
  const investors = await getInvestors();
  if (investors.length === 0) {
    console.log('[Institutional] No investors configured. Run migration_sprint6a.sql first.');
    return;
  }

  for (const investor of investors) {
    try {
      console.log(`  ${investor.name} (CIK: ${investor.cik})...`);
      const filing = await fetch13F(investor.cik);
      if (!filing || !filing.holdings || filing.holdings.length === 0) {
        console.log(`  ${investor.name}: no holdings found`);
        await sleep(500);
        continue;
      }

      const quarter = filing.quarter;
      console.log(`  ${investor.name}: ${filing.holdings_count} holdings for ${quarter}`);

      // Calculate total portfolio value for % calculations
      const totalValue = filing.holdings.reduce((sum, h) => sum + (h.market_value || 0), 0);

      // Upsert holdings
      const holdingsRows = filing.holdings
        .filter(h => h.type === 'SH' || !h.type) // Only shares, not options
        .sort((a, b) => (b.market_value || 0) - (a.market_value || 0))
        .map((h, idx) => ({
          investor_id: investor.id,
          quarter,
          ticker: h.ticker || h.company_name?.substring(0, 20) || 'UNKNOWN',
          cusip: h.cusip,
          company_name: h.company_name,
          shares: h.shares,
          market_value: h.market_value,
          pct_of_portfolio: totalValue > 0 ? Math.round(h.market_value / totalValue * 10000) / 100 : null,
          portfolio_rank: idx + 1,
          has_call_options: filing.holdings.some(
            oh => oh.cusip === h.cusip && oh.type === 'CALL'
          ),
          has_put_options: filing.holdings.some(
            oh => oh.cusip === h.cusip && oh.type === 'PUT'
          ),
        }));

      // Batch upsert
      const batchSize = 100;
      for (let i = 0; i < holdingsRows.length; i += batchSize) {
        const batch = holdingsRows.slice(i, i + batchSize);
        const { error } = await supabase
          .from('investor_holdings')
          .upsert(batch, { onConflict: 'investor_id,quarter,ticker' });
        if (error) console.error(`  Upsert error:`, error.message);
      }

      // Update portfolio value on investor
      await supabase
        .from('super_investors')
        .update({ portfolio_value_latest: totalValue })
        .eq('id', investor.id);

      // Compute signals: compare with prior quarter
      const priorQuarter = getPriorQuarter(quarter);
      const { data: priorHoldings } = await supabase
        .from('investor_holdings')
        .select('*')
        .eq('investor_id', investor.id)
        .eq('quarter', priorQuarter);

      if (priorHoldings && priorHoldings.length > 0) {
        const signals = computeSignals(holdingsRows, priorHoldings, investor.id, quarter);

        // Check consecutive quarters for each signal
        for (const sig of signals) {
          const consecutive = await getConsecutiveQuarters(investor.id, sig.ticker, sig.signal_type);
          sig.consecutive_quarters_same_direction = consecutive;
        }

        // Upsert signals
        for (let i = 0; i < signals.length; i += batchSize) {
          const batch = signals.slice(i, i + batchSize);
          const { error } = await supabase
            .from('investor_signals')
            .upsert(batch, { onConflict: 'investor_id,quarter,ticker' });
          if (error) console.error(`  Signals upsert error:`, error.message);
        }

        const newBuys = signals.filter(s => s.signal_type === 'NEW_BUY').length;
        const exits = signals.filter(s => s.signal_type === 'EXIT').length;
        console.log(`  ${investor.name}: ${signals.length} signals (${newBuys} new buys, ${exits} exits)`);
      } else {
        console.log(`  ${investor.name}: no prior quarter data for comparison`);
      }

    } catch (err) {
      console.error(`  ${investor.name}: ERROR -`, err.message);
    }
    await sleep(2000); // Respect SEC rate limits between investors
  }

  // Compute cross-investor consensus
  await computeConsensus();
}

/**
 * Compute quarterly change signals between current and prior holdings.
 */
function computeSignals(currentHoldings, priorHoldings, investorId, quarter) {
  const priorMap = {};
  for (const h of priorHoldings) {
    priorMap[h.ticker] = h;
  }

  const signals = [];

  // Current holdings vs prior
  for (const curr of currentHoldings) {
    const prior = priorMap[curr.ticker];
    let signalType, sharesChanged, pctChange;

    if (!prior) {
      signalType = 'NEW_BUY';
      sharesChanged = curr.shares;
      pctChange = 100;
    } else {
      sharesChanged = curr.shares - prior.shares;
      pctChange = prior.shares > 0 ? Math.round(sharesChanged / prior.shares * 10000) / 100 : 100;

      if (Math.abs(pctChange) < 1) signalType = 'UNCHANGED';
      else if (pctChange > 0) signalType = 'ADD';
      else signalType = 'REDUCE';
    }

    const conviction = assessConviction(curr.market_value, pctChange, signalType, curr.has_call_options);

    signals.push({
      investor_id: investorId,
      ticker: curr.ticker,
      quarter,
      signal_type: signalType,
      shares_changed: sharesChanged,
      pct_change: pctChange,
      conviction_level: conviction,
    });

    delete priorMap[curr.ticker];
  }

  // Exits: in prior but not in current
  for (const [ticker, prior] of Object.entries(priorMap)) {
    signals.push({
      investor_id: investorId,
      ticker,
      quarter,
      signal_type: 'EXIT',
      shares_changed: -prior.shares,
      pct_change: -100,
      conviction_level: 'HIGH',
    });
  }

  return signals;
}

function assessConviction(marketValue, pctChange, signalType, hasCalls) {
  if (hasCalls && (signalType === 'NEW_BUY' || signalType === 'ADD')) return 'EXTREME';

  if (signalType === 'NEW_BUY') {
    if (marketValue > 1e9) return 'EXTREME';
    if (marketValue > 500e6) return 'HIGH';
    if (marketValue > 100e6) return 'MODERATE';
    return 'LOW';
  }
  if (signalType === 'ADD') {
    if (pctChange > 50) return 'HIGH';
    if (pctChange > 20) return 'MODERATE';
    return 'LOW';
  }
  if (signalType === 'REDUCE') {
    if (Math.abs(pctChange) > 50) return 'HIGH';
    return 'MODERATE';
  }
  return 'LOW';
}

/**
 * Count consecutive quarters with the same directional signal for a ticker.
 */
async function getConsecutiveQuarters(investorId, ticker, signalType) {
  const direction = (signalType === 'NEW_BUY' || signalType === 'ADD') ? 'buy' : 'sell';
  const matchTypes = direction === 'buy' ? ['NEW_BUY', 'ADD'] : ['REDUCE', 'EXIT'];

  const { data } = await supabase
    .from('investor_signals')
    .select('quarter, signal_type')
    .eq('investor_id', investorId)
    .eq('ticker', ticker)
    .order('quarter', { ascending: false })
    .limit(8);

  if (!data) return 1;

  let count = 1; // current quarter counts as 1
  for (const row of data) {
    if (matchTypes.includes(row.signal_type)) count++;
    else break;
  }
  return count;
}

/**
 * Compute cross-investor consensus for all tickers.
 */
async function computeConsensus() {
  console.log('[Institutional] Computing cross-investor consensus...');

  // Get the most recent quarter from signals
  const { data: latestSig } = await supabase
    .from('investor_signals')
    .select('quarter')
    .order('quarter', { ascending: false })
    .limit(1);

  if (!latestSig || latestSig.length === 0) {
    console.log('[Institutional] No signals to compute consensus from');
    return;
  }

  const quarter = latestSig[0].quarter;

  const { data: allSignals } = await supabase
    .from('investor_signals')
    .select('*, super_investors(name)')
    .eq('quarter', quarter);

  if (!allSignals || allSignals.length === 0) return;

  // Group by ticker
  const tickerMap = {};
  for (const sig of allSignals) {
    if (!tickerMap[sig.ticker]) {
      tickerMap[sig.ticker] = { score: 0, holders: 0, newBuyers: 0, sellers: 0 };
    }
    const entry = tickerMap[sig.ticker];

    switch (sig.signal_type) {
      case 'NEW_BUY': entry.score += 3; entry.holders++; entry.newBuyers++; break;
      case 'ADD': entry.score += 2; entry.holders++; break;
      case 'UNCHANGED': entry.score += 1; entry.holders++; break;
      case 'REDUCE': entry.score -= 1; entry.sellers++; entry.holders++; break;
      case 'EXIT': entry.score -= 3; entry.sellers++; break;
    }
    if (sig.conviction_level === 'EXTREME') entry.score += 2;
  }

  const consensusRows = Object.entries(tickerMap).map(([ticker, data]) => {
    const score = Math.max(-10, Math.min(10, data.score));
    let sentiment;
    if (score >= 6) sentiment = 'STRONG_BUY';
    else if (score >= 3) sentiment = 'BUY';
    else if (score >= -2) sentiment = 'MIXED';
    else if (score >= -5) sentiment = 'SELL';
    else sentiment = 'STRONG_SELL';

    return {
      ticker,
      quarter,
      holders_count: data.holders,
      new_buyers_count: data.newBuyers,
      sellers_count: data.sellers,
      net_sentiment: sentiment,
      consensus_score: score,
    };
  });

  // Upsert consensus
  const batchSize = 100;
  for (let i = 0; i < consensusRows.length; i += batchSize) {
    const batch = consensusRows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('consensus_signals')
      .upsert(batch, { onConflict: 'ticker,quarter' });
    if (error) console.error('[Institutional] Consensus upsert error:', error.message);
  }

  const strongBuys = consensusRows.filter(r => r.net_sentiment === 'STRONG_BUY').length;
  console.log(`[Institutional] Consensus: ${consensusRows.length} tickers, ${strongBuys} strong buys`);
}

/**
 * Get institutional data for a specific ticker (used by scorer).
 */
async function getInstitutionalData(ticker) {
  const defaults = {
    superInvestorCount: 0,
    newBuysThisQuarter: 0,
    consecutiveQuarterlyAdds: 0,
    hasCallOptions: false,
    activistLetterAgainst: false,
    largestReductionPct: 0,
    consecutiveQuarterlyReductions: 0,
    rapidAbandonment: false,
    consensusScore: 0,
    consensusSentiment: null,
  };

  // Get consensus data
  const { data: consensus } = await supabase
    .from('consensus_signals')
    .select('*')
    .eq('ticker', ticker)
    .order('quarter', { ascending: false })
    .limit(1);

  if (consensus && consensus.length > 0) {
    const c = consensus[0];
    defaults.superInvestorCount = c.holders_count || 0;
    defaults.newBuysThisQuarter = c.new_buyers_count || 0;
    defaults.consensusScore = c.consensus_score || 0;
    defaults.consensusSentiment = c.net_sentiment;
  }

  // Get latest signals for this ticker
  const { data: signals } = await supabase
    .from('investor_signals')
    .select('*')
    .eq('ticker', ticker)
    .order('quarter', { ascending: false })
    .limit(20);

  if (signals && signals.length > 0) {
    // Check for call options
    const { data: holdings } = await supabase
      .from('investor_holdings')
      .select('has_call_options')
      .eq('ticker', ticker)
      .eq('has_call_options', true)
      .limit(1);
    defaults.hasCallOptions = holdings && holdings.length > 0;

    // Find largest reduction
    const reductions = signals.filter(s => s.signal_type === 'REDUCE');
    if (reductions.length > 0) {
      defaults.largestReductionPct = Math.max(...reductions.map(r => Math.abs(r.pct_change || 0)));
    }

    // Check for consecutive quarterly adds
    const adds = signals.filter(s => s.signal_type === 'ADD' || s.signal_type === 'NEW_BUY');
    if (adds.length > 0) {
      defaults.consecutiveQuarterlyAdds = adds[0].consecutive_quarters_same_direction || 1;
    }

    // Check for consecutive reductions
    const exits = signals.filter(s => s.signal_type === 'REDUCE' || s.signal_type === 'EXIT');
    if (exits.length > 0) {
      defaults.consecutiveQuarterlyReductions = exits[0].consecutive_quarters_same_direction || 1;
    }

    // Rapid abandonment: position bought < 2 quarters ago, now selling > 50%
    const latestSignal = signals[0];
    if (latestSignal.signal_type === 'EXIT' || (latestSignal.signal_type === 'REDUCE' && Math.abs(latestSignal.pct_change) > 50)) {
      const buySignals = signals.filter(s => s.signal_type === 'NEW_BUY');
      if (buySignals.length > 0) {
        const buyQuarter = buySignals[0].quarter;
        const quartersAgo = quarterDiff(latestSignal.quarter, buyQuarter);
        if (quartersAgo <= 2) {
          defaults.rapidAbandonment = true;
        }
      }
    }
  }

  return defaults;
}

/**
 * Get macro context for penalty calculations.
 * This aggregates signals from all 8 investors to detect late-cycle positioning.
 */
async function getMacroContext() {
  const defaults = {
    lateCycleScore: 0,
    rateSensitiveBanksBearish: false,
    glp1Exhausted: false,
    geopoliticalRiskElevated: false,
    carryTradeRisk: 'LOW',
    saasDisruptionRisk: false,
  };

  // Count how many investors are going defensive (reducing tech, adding staples/utilities)
  const { data: latestSignals } = await supabase
    .from('investor_signals')
    .select('*')
    .order('quarter', { ascending: false })
    .limit(200);

  if (!latestSignals || latestSignals.length === 0) return defaults;

  // Simple heuristic: count exits from growth stocks as late-cycle indicator
  const exits = latestSignals.filter(s => s.signal_type === 'EXIT');
  const uniqueExiters = new Set(exits.map(s => s.investor_id));
  defaults.lateCycleScore = uniqueExiters.size; // 0-8 scale

  return defaults;
}

// ── Helpers ──

function getPriorQuarter(quarter) {
  const year = parseInt(quarter.substring(0, 4));
  const q = parseInt(quarter.substring(5));
  if (q === 1) return `${year - 1}Q4`;
  return `${year}Q${q - 1}`;
}

function quarterDiff(q1, q2) {
  const y1 = parseInt(q1.substring(0, 4));
  const qn1 = parseInt(q1.substring(5));
  const y2 = parseInt(q2.substring(0, 4));
  const qn2 = parseInt(q2.substring(5));
  return (y1 * 4 + qn1) - (y2 * 4 + qn2);
}

module.exports = {
  getInvestors,
  fetch13F,
  refreshAllInvestors,
  getInstitutionalData,
  getMacroContext,
  computeConsensus,
};
