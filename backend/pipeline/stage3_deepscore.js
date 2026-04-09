const supabase = require('../services/supabase');
const { fetchHistoricalPrices, fetchFundamentals, calculate200WMA, calculate200MMA, sleep } = require('../services/fetcher');
const { runScorer } = require('../services/scorer');
const { fireAlert } = require('../services/alerts');
const { getInstitutionalData, getMacroContext } = require('../services/institutional');
const { computeThreePillarValuation, scoreValuation, saveValuation } = require('../services/valuation');
const { recordSignal } = require('../services/signalTracker');

/**
 * Stage 3 — Deep Score
 * For each candidate: fetch full data, run TLI scorer, detect signal changes,
 * fire Telegram alerts, and upsert into screener_results.
 */
let isRunning = false;

async function runDeepScore() {
  if (isRunning) {
    console.log('[Stage 3] Already running, skipping duplicate trigger');
    return;
  }
  isRunning = true;
  try {
    await _runDeepScore();
  } finally {
    isRunning = false;
  }
}

async function _runDeepScore() {
  console.log('\n[Stage 3] Starting deep scoring of candidates...');
  const startTime = Date.now();

  const { data: candidates, error: readErr } = await supabase
    .from('screener_candidates')
    .select('ticker, company_name, sector');

  if (readErr || !candidates) {
    console.error('[Stage 3] Failed to read candidates:', readErr?.message);
    return;
  }

  console.log(`[Stage 3] Scoring ${candidates.length} candidates...`);

  const results = [];
  let alertsFired = 0;

  // Cache macro context (only fetch once per run)
  let _cachedMacroContext = null;
  try {
    _cachedMacroContext = await getMacroContext();
  } catch (_) { /* institutional tables may not exist yet */ }

  // Build sector average P/E from prior run data
  const sectorPEMap = {};
  {
    const { data: priorResults } = await supabase
      .from('screener_results')
      .select('sector, pe_ratio')
      .not('pe_ratio', 'is', null);
    if (priorResults) {
      const sectorPEs = {};
      for (const r of priorResults) {
        if (!r.sector || r.pe_ratio == null || r.pe_ratio <= 0 || r.pe_ratio > 500) continue;
        if (!sectorPEs[r.sector]) sectorPEs[r.sector] = [];
        sectorPEs[r.sector].push(r.pe_ratio);
      }
      for (const [sec, pes] of Object.entries(sectorPEs)) {
        sectorPEMap[sec] = Math.round(pes.reduce((a, b) => a + b, 0) / pes.length * 10) / 10;
      }
    }
  }

  for (let i = 0; i < candidates.length; i++) {
    const { ticker, company_name, sector } = candidates[i];

    try {
      // Fetch fundamentals then historical prices sequentially
      // (parallel requests caused duplicate simultaneous scraper hits per ticker)
      const fund = await fetchFundamentals(ticker);
      const historicals = await fetchHistoricalPrices(ticker);

      if (!fund || fund.currentPrice == null) {
        console.log(`  ${ticker}: no data, skipping`);
        await sleep(300);
        continue;
      }

      const price200WMA = calculate200WMA(historicals.weeklyCloses);
      const price200MMA = calculate200MMA(historicals.monthlyCloses);
      const currentPrice = fund.currentPrice;

      // 52-week low from last 52 weekly closes
      const last52Weeks = historicals.weeklyCloses.slice(-52);
      const week52Low = last52Weeks.length > 0 ? Math.min(...last52Weeks) : null;

      // Volume trend: compare avg volume of last 4 weeks vs prior 8 weeks
      let volumeTrend = null;
      let volumeTrendRatio = null;
      const vols = historicals.weeklyVolumes || [];
      if (vols.length >= 12) {
        const recent4 = vols.slice(-4);
        const prior8 = vols.slice(-12, -4);
        const avgRecent = recent4.reduce((a, b) => a + b, 0) / recent4.length;
        const avgPrior = prior8.reduce((a, b) => a + b, 0) / prior8.length;
        if (avgPrior > 0) {
          volumeTrendRatio = Math.round((avgRecent / avgPrior) * 100) / 100;
          if (volumeTrendRatio > 1.2) volumeTrend = 'UP';
          else if (volumeTrendRatio < 0.8) volumeTrend = 'DOWN';
          else volumeTrend = 'NEUTRAL';
        }
      }

      // ── 50-day SMA (approximate from ~10 weekly closes) ──
      const last10Weeks = historicals.weeklyCloses.slice(-10);
      const ma50d = last10Weeks.length >= 8
        ? Math.round(last10Weeks.reduce((a, b) => a + b, 0) / last10Weeks.length * 100) / 100
        : null;

      // ── 200-day SMA (approximate from ~40 weekly closes) ──
      const last40Weeks = historicals.weeklyCloses.slice(-40);
      const ma200d = last40Weeks.length >= 30
        ? Math.round(last40Weeks.reduce((a, b) => a + b, 0) / last40Weeks.length * 100) / 100
        : null;

      // ── Golden Cross / Death Cross (50d vs 200d within last 8 weeks) ──
      let goldenCross = false;
      let deathCross = false;
      if (historicals.weeklyCloses.length >= 48) {
        const calcSma = (arr, n) => arr.length >= n ? arr.slice(-n).reduce((a, b) => a + b, 0) / n : null;
        // Check crossover in recent 8 weekly snapshots
        for (let w = 8; w >= 1; w--) {
          const sliceEnd = historicals.weeklyCloses.length - w;
          if (sliceEnd < 40) continue;
          const prevSlice = historicals.weeklyCloses.slice(0, sliceEnd);
          const currSlice = historicals.weeklyCloses.slice(0, sliceEnd + 1);
          const prev50 = calcSma(prevSlice, 10);
          const prev200 = calcSma(prevSlice, 40);
          const curr50 = calcSma(currSlice, 10);
          const curr200 = calcSma(currSlice, 40);
          if (prev50 != null && prev200 != null && curr50 != null && curr200 != null) {
            if (prev50 <= prev200 && curr50 > curr200) goldenCross = true;
            if (prev50 >= prev200 && curr50 < curr200) deathCross = true;
          }
        }
      }

      // ── Higher Highs / Higher Lows pattern ──
      let hhHlPattern = false;
      if (historicals.weeklyCloses.length >= 20) {
        // Find swing highs and lows from last 20 weekly closes
        const recent = historicals.weeklyCloses.slice(-20);
        const swingHighs = [];
        const swingLows = [];
        for (let j = 1; j < recent.length - 1; j++) {
          if (recent[j] > recent[j - 1] && recent[j] > recent[j + 1]) swingHighs.push(recent[j]);
          if (recent[j] < recent[j - 1] && recent[j] < recent[j + 1]) swingLows.push(recent[j]);
        }
        if (swingHighs.length >= 3 && swingLows.length >= 3) {
          const lastH = swingHighs.slice(-3);
          const lastL = swingLows.slice(-3);
          hhHlPattern = (lastH[0] < lastH[1] && lastH[1] < lastH[2]) &&
                        (lastL[0] < lastL[1] && lastL[1] < lastL[2]);
        }
      }

      // Get previous score/signal for comparison (for alert detection)
      const { data: prev } = await supabase
        .from('screener_results')
        .select('total_score, signal, current_price, price_200wma, price_200mma')
        .eq('ticker', ticker)
        .maybeSingle();

      const previousScore = prev?.total_score ?? null;
      const previousSignal = prev?.signal ?? null;
      const prevPrice = prev?.current_price ?? null;

      // Fetch institutional data for this ticker (returns defaults if none)
      let institutionalData = null;
      let macroContext = null;
      try {
        institutionalData = await getInstitutionalData(ticker);
        if (i === 0) macroContext = await getMacroContext(); // once per run
      } catch (_) { /* graceful fallback if tables don't exist yet */ }

      // Compute dividend yield
      const dividendYield = (fund.dividendPerShare != null && currentPrice > 0)
        ? Math.round(fund.dividendPerShare / currentPrice * 10000) / 100
        : null;

      // Sector average P/E (from results we've already scored)
      const sectorAvgPE = sectorPEMap[sector] ?? null;

      // Run TLI scorer with extended options
      const scores = runScorer({
        currentPrice,
        week52High: fund.week52High,
        week52Low,
        price200WMA,
        price200MMA,
        revenueGrowthPct: fund.revenueGrowthPct,
        psRatio: fund.psRatio,
        peRatio: fund.peRatio,
        // Part 8 additional inputs
        ma50d,
        goldenCross,
        deathCross,
        hhHlPattern,
        previousScore,
        // Sprint 6A inputs
        revenueGrowth3YrAvg: fund.revenueGrowth3YrAvg,
        fcfMargin: fund.fcfMargin,
        fcfGrowthYoY: fund.fcfGrowthYoY,
        cashAndEquivalents: fund.cashAndEquivalents,
        totalDebt: fund.totalDebt,
        debtToEquity: fund.debtToEquity,
        sharesOutstandingChange: fund.sharesOutstandingChange,
        dividendYield,
        grossMarginCurrent: fund.grossMarginCurrent,
        capex: fund.capex,
        epsGaap: fund.epsDiluted,
        sectorAvgPE,
        sector,
        institutionalData,
        macroContext: macroContext || _cachedMacroContext,
      });

      // Build result row (store all scored tickers, including PASS)
      const row = {
        ticker,
        company_name: company_name || fund.companyName,
        sector: sector || fund.sector,
        current_price: currentPrice,
        price_200wma: price200WMA != null ? Math.round(price200WMA * 100) / 100 : null,
        price_200mma: price200MMA != null ? Math.round(price200MMA * 100) / 100 : null,
        pct_from_200wma: scores.pctFrom200WMA,
        pct_from_200mma: scores.pctFrom200MMA,
        revenue_current: fund.revenueCurrent,
        revenue_prior_year: fund.revenuePrior,
        revenue_growth_pct: fund.revenueGrowthPct != null ? Math.round(fund.revenueGrowthPct * 10) / 10 : null,
        revenue_history: fund.revenueHistory?.length > 0 ? fund.revenueHistory : null,
        gross_margin_current: fund.grossMarginCurrent ?? null,
        gross_margin_history: fund.grossMarginHistory?.length > 0 ? fund.grossMarginHistory : null,
        pe_ratio: fund.peRatio != null ? Math.round(fund.peRatio * 10) / 10 : null,
        ps_ratio: fund.psRatio != null ? Math.round(fund.psRatio * 10) / 10 : null,
        week_52_high: fund.week52High,
        week_52_low: week52Low,
        pct_from_52w_high: scores.pctFrom52wHigh,
        confluence_zone: scores.confluenceZone,
        confluence_note: scores.confluenceNote || null,
        fundamental_score: scores.fundamentalScore,
        technical_score: scores.technicalScore,
        total_score: scores.totalScore,
        previous_score: previousScore,
        signal: scores.signal,
        previous_signal: previousSignal,
        entry_zone: scores.entryZone,
        entry_note: scores.entryNote,
        volume_trend: volumeTrend,
        volume_trend_ratio: volumeTrendRatio,
        // Part 8 columns
        ma_50d: ma50d,
        golden_cross: goldenCross,
        death_cross: deathCross,
        hh_hl_pattern: hhHlPattern,
        generational_buy: scores.generationalBuy || false,
        return_to_200wma_pct: scores.returnTo200wmaPct,
        // Sprint 6A columns
        score_v1: scores.scoreV1,
        fundamental_base: scores.fundamentalBase,
        technical_base: scores.technicalBase,
        bonus_points: scores.bonusPoints,
        penalty_points: scores.penaltyPoints,
        earnings_quality_adj: scores.earningsQualityAdj,
        wave_bonus: scores.waveBonus,
        flags: scores.flags?.length > 0 ? scores.flags : null,
        institutional_holders: institutionalData?.superInvestorCount ?? null,
        institutional_consensus: institutionalData?.consensusSentiment ?? null,
        fcf_margin: fund.fcfMargin ?? null,
        fcf_growth_yoy: fund.fcfGrowthYoY ?? null,
        revenue_growth_3yr: fund.revenueGrowth3YrAvg ?? null,
        free_cash_flow: fund.freeCashFlow ?? null,
        capex: fund.capex ?? null,
        cash_and_equivalents: fund.cashAndEquivalents ?? null,
        total_debt: fund.totalDebt ?? null,
        debt_to_equity: fund.debtToEquity ?? null,
        shares_outstanding_change: fund.sharesOutstandingChange ?? null,
        dividend_yield: dividendYield,
        eps_gaap: fund.epsDiluted ?? null,
        sector_avg_pe: sectorAvgPE,
        score_breakdown: scores.scoreBreakdown ?? null,
        last_updated: new Date().toISOString(),
      };

      // Valuation computation (Sprint 6B)
      try {
        const valInput = {
          currentPrice,
          sector: sector || fund.sector,
          marketCap: fund.marketCap,
          debtToEquity: fund.debtToEquity,
          totalDebt: fund.totalDebt,
          cashAndEquivalents: fund.cashAndEquivalents,
          freeCashFlow: fund.freeCashFlow,
          ttmFCF: fund.freeCashFlow,
          revenueCurrent: fund.revenueCurrent,
          ttmRevenue: fund.revenueCurrent,
          revenueGrowth3YrAvg: fund.revenueGrowth3YrAvg,
          fcfGrowth3YrAvg: fund.fcfGrowthYoY,
          dilutedShares: fund.dilutedShares,
        };
        const valuation = computeThreePillarValuation(valInput);
        if (valuation) {
          const valScore = scoreValuation(valuation);
          row.valuation_rating = valuation.rating;
          row.avg_price_target = valuation.avgTarget;
          row.avg_upside_pct = valuation.avgUpside;
          row.dcf_price_target = valuation.dcf?.target ?? null;
          row.ev_sales_price_target = valuation.evSales?.target ?? null;
          row.ev_ebitda_price_target = valuation.evEbitda?.target ?? null;
          row.wacc_risk_tier = valuation.waccTier;
          await saveValuation(ticker, valuation);
        }
      } catch (_) { /* valuation tables may not exist yet */ }

      results.push(row);

      // Record signal for outcome tracking (Sprint 6B)
      try {
        await recordSignal(
          { ticker, currentPrice: currentPrice, current_price: currentPrice },
          scores
        );
      } catch (_) { /* signal_outcomes table may not exist yet */ }

      // Detect alerts (only for non-PASS signals)
      const alerts = scores.signal === 'PASS' ? [] : detectAlerts({
        ticker,
        companyName: row.company_name,
        sector: row.sector,
        currentPrice,
        price200WMA,
        price200MMA,
        score: scores.totalScore,
        signal: scores.signal,
        previousSignal,
        entryNote: scores.entryNote,
        prevPrice,
        prevWMA: prev?.price_200wma ?? null,
        prevMMA: prev?.price_200mma ?? null,
      });

      for (const alert of alerts) {
        await fireAlert(alert);
        await supabase.from('signal_alerts').insert(alert);
        alertsFired++;
      }

      // Only log non-PASS signals to reduce noise
      if (scores.signal !== 'PASS') {
        console.log(`  ${ticker}: ${scores.totalScore} - ${scores.signal}${scores.entryZone ? ' [ENTRY ZONE]' : ''}${scores.confluenceZone ? ' [CONFLUENCE]' : ''}${alerts.length > 0 ? ` (${alerts.length} alerts)` : ''}`);
      }

      if ((i + 1) % 100 === 0) {
        console.log(`[Stage 3] Progress: ${i + 1}/${candidates.length} scored, ${results.filter(r => r.signal !== 'PASS').length} non-PASS so far`);
      }
    } catch (err) {
      console.error(`  ${ticker}: ERROR -`, err.message);
    }

    await sleep(300);
  }

  // Calculate sector averages and rank each stock within its sector
  if (results.length > 0) {
    const sectorGroups = {};
    for (const r of results) {
      if (!r.sector) continue;
      if (!sectorGroups[r.sector]) sectorGroups[r.sector] = [];
      sectorGroups[r.sector].push(r);
    }

    for (const [sector, stocks] of Object.entries(sectorGroups)) {
      const avg = Math.round(stocks.reduce((s, r) => s + r.total_score, 0) / stocks.length * 10) / 10;
      const sorted = [...stocks].sort((a, b) => b.total_score - a.total_score);

      for (let j = 0; j < sorted.length; j++) {
        const pct = stocks.length > 1 ? (j / (stocks.length - 1)) * 100 : 50;
        let rank;
        if (pct <= 10) rank = 'TOP 10%';
        else if (pct <= 25) rank = 'TOP 25%';
        else if (pct <= 75) rank = 'AVERAGE';
        else rank = 'BELOW AVERAGE';

        sorted[j].sector_avg_score = avg;
        sorted[j].sector_rank = rank;
      }
    }
  }

  // Upsert all results
  if (results.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < results.length; i += batchSize) {
      const batch = results.slice(i, i + batchSize);
      const { error } = await supabase
        .from('screener_results')
        .upsert(batch, { onConflict: 'ticker' });
      if (error) console.error('[Stage 3] Upsert error:', error.message);
    }
  }

  // Scan summary
  const loadCount = results.filter((r) => r.signal === 'LOAD THE BOAT').length;
  const accumCount = results.filter((r) => r.signal === 'ACCUMULATE').length;
  const topOpps = results
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 10)
    .map((r) => ({ ticker: r.ticker, score: r.total_score, signal: r.signal, entry_zone: r.entry_zone }));

  await supabase.from('scan_history').insert({
    stage: 'DEEPSCORE',
    tickers_processed: candidates.length,
    tickers_passed: results.length,
    load_the_boat_count: loadCount,
    accumulate_count: accumCount,
    alerts_fired: alertsFired,
    top_opportunities: topOpps,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Stage 3] Complete: ${results.length} scored | ${loadCount} LOAD THE BOAT | ${accumCount} ACCUMULATE | ${alertsFired} alerts (${elapsed}s)`);
}

/**
 * Detect which alerts to fire for a ticker based on signal changes.
 */
function detectAlerts({ ticker, companyName, sector, currentPrice, price200WMA, price200MMA, score, signal, previousSignal, entryNote, prevPrice, prevWMA, prevMMA }) {
  const alerts = [];
  const base = {
    ticker,
    company_name: companyName,
    score,
    current_price: currentPrice,
    price_200wma: price200WMA,
    price_200mma: price200MMA,
    entry_note: entryNote,
  };

  // New LOAD THE BOAT signal
  if (signal === 'LOAD THE BOAT' && previousSignal !== 'LOAD THE BOAT') {
    alerts.push({
      ...base,
      alert_type: 'LOAD_THE_BOAT',
      previous_signal: previousSignal,
      new_signal: signal,
    });
  }
  // Signal upgrade (WATCH → ACCUMULATE, etc.)
  else if (previousSignal && previousSignal !== signal) {
    const rank = { PASS: 0, WATCH: 1, ACCUMULATE: 2, 'LOAD THE BOAT': 3 };
    if ((rank[signal] || 0) > (rank[previousSignal] || 0)) {
      alerts.push({
        ...base,
        alert_type: 'SIGNAL_UPGRADE',
        previous_signal: previousSignal,
        new_signal: signal,
      });
    }
  }

  // Price crossed below 200WMA
  if (price200WMA != null && currentPrice < price200WMA && prevPrice != null && prevPrice >= price200WMA) {
    alerts.push({
      ...base,
      alert_type: 'CROSSED_200WMA',
      previous_signal: previousSignal,
      new_signal: signal,
    });
  }

  // Price crossed below 200MMA
  if (price200MMA != null && currentPrice < price200MMA && prevPrice != null && prevPrice >= price200MMA) {
    alerts.push({
      ...base,
      alert_type: 'CROSSED_200MMA',
      previous_signal: previousSignal,
      new_signal: signal,
    });
  }

  return alerts;
}

module.exports = { runDeepScore };
