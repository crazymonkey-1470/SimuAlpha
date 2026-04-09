const supabase = require('./supabase');

/**
 * Three-Pillar Valuation Engine — Sprint 6B
 * TLI methodology: DCF + EV/Sales + EV/EBITDA
 */

// ═══════════════════════════════════════════
// WACC ESTIMATION
// ═══════════════════════════════════════════

const SECTOR_WACC = {
  'Consumer Staples': 5.0,
  'Healthcare': 6.0,
  'Financials': 6.5,
  'Industrials': 7.0,
  'Energy': 7.5,
  'Information Technology': 8.0,
  'Consumer Discretionary': 9.0,
  'Communication Services': 8.5,
  'Communications': 8.5,
  'Materials': 7.5,
  'Utilities': 5.5,
  'Real Estate': 7.0,
};

// Sector-specific EV/Sales defaults (used when no 5yr historical available)
const SECTOR_EV_SALES = {
  'Consumer Staples': 2.0,
  'Healthcare': 4.0,
  'Financials': 2.5,
  'Industrials': 2.0,
  'Energy': 1.5,
  'Information Technology': 6.0,
  'Consumer Discretionary': 2.5,
  'Communication Services': 3.5,
  'Communications': 3.5,
  'Materials': 1.8,
  'Utilities': 2.5,
  'Real Estate': 5.0,
};

const SECTOR_EV_EBITDA = {
  'Consumer Staples': 12.0,
  'Healthcare': 15.0,
  'Financials': 10.0,
  'Industrials': 11.0,
  'Energy': 7.0,
  'Information Technology': 18.0,
  'Consumer Discretionary': 12.0,
  'Communication Services': 14.0,
  'Communications': 14.0,
  'Materials': 9.0,
  'Utilities': 10.0,
  'Real Estate': 15.0,
};

function estimateWACC(stock) {
  let wacc = SECTOR_WACC[stock.sector] || 8.0;

  // Use real beta if available, otherwise skip the beta adjustment
  if (stock.beta != null && stock.beta > 1.5) wacc += 1.0;
  else if (stock.beta != null && stock.beta < 0.7) wacc -= 0.5; // low beta = lower risk
  if (stock.debtToEquity != null && stock.debtToEquity > 1.5) wacc += 0.5;
  if (stock.marketCap != null && stock.marketCap < 2e9) wacc += 1.0;
  if (stock.revenueGrowth3YrAvg != null && stock.revenueGrowth3YrAvg < 0) wacc += 1.0;

  return Math.min(Math.max(wacc, 3), 12); // floor at 3%
}

function estimateTerminalRate(stock) {
  const growth = stock.revenueGrowth3YrAvg;
  if (growth != null && growth > 20) return 2.5;
  if (growth != null && growth > 10) return 2.0;
  return 1.5;
}

function estimateGrowthRate(stock) {
  const trailing = stock.fcfGrowth3YrAvg || stock.revenueGrowth3YrAvg;
  if (trailing == null) return 5; // conservative default
  return Math.max(0, Math.min(trailing * 0.6, 25));
}

// ═══════════════════════════════════════════
// DCF CALCULATION
// ═══════════════════════════════════════════

function computeDCF({ ttmFCF, sharesOutstanding, growthRate, terminalRate, wacc, years }) {
  if (!ttmFCF || ttmFCF <= 0 || !sharesOutstanding || sharesOutstanding <= 0) return null;
  if (wacc <= terminalRate) return null; // invalid: would produce negative terminal value

  let totalPV = 0;
  let fcf = ttmFCF;

  for (let i = 1; i <= years; i++) {
    fcf *= (1 + growthRate / 100);
    totalPV += fcf / Math.pow(1 + wacc / 100, i);
  }

  const terminalFCF = fcf * (1 + terminalRate / 100);
  const terminalValue = terminalFCF / ((wacc - terminalRate) / 100);
  const pvTerminal = terminalValue / Math.pow(1 + wacc / 100, years);

  const intrinsicValue = totalPV + pvTerminal;
  return Math.round((intrinsicValue / sharesOutstanding) * 100) / 100;
}

// ═══════════════════════════════════════════
// EV/SALES VALUATION
// ═══════════════════════════════════════════

function computeEVSales({ ttmRevenue, historicalEVSales, netDebt, sharesOutstanding, sector }) {
  if (!ttmRevenue || ttmRevenue <= 0 || !sharesOutstanding || sharesOutstanding <= 0) return null;
  // Priority: real 5yr historical > sector default > global default
  const multiple = historicalEVSales || SECTOR_EV_SALES[sector] || 3.0;
  const ev = ttmRevenue * multiple;
  const equityValue = ev - (netDebt || 0);
  if (equityValue <= 0) return null;
  return Math.round((equityValue / sharesOutstanding) * 100) / 100;
}

// ═══════════════════════════════════════════
// EV/EBITDA VALUATION
// ═══════════════════════════════════════════

function computeEVEBITDA({ ttmEBITDA, historicalEVEBITDA, netDebt, sharesOutstanding, sector }) {
  if (!ttmEBITDA || ttmEBITDA <= 0 || !sharesOutstanding || sharesOutstanding <= 0) return null;
  // Priority: real 5yr historical > sector default > global default
  const multiple = historicalEVEBITDA || SECTOR_EV_EBITDA[sector] || 12.0;
  const ev = ttmEBITDA * multiple;
  const equityValue = ev - (netDebt || 0);
  if (equityValue <= 0) return null;
  return Math.round((equityValue / sharesOutstanding) * 100) / 100;
}

// ═══════════════════════════════════════════
// THREE-PILLAR VALUATION
// ═══════════════════════════════════════════

function computeThreePillarValuation(stock) {
  const currentPrice = stock.currentPrice;
  if (!currentPrice || currentPrice <= 0) return null;

  const wacc = estimateWACC(stock);
  const growthRate = estimateGrowthRate(stock);
  const terminalRate = estimateTerminalRate(stock);

  const netDebt = (stock.totalDebt || 0) - (stock.cashAndEquivalents || 0);
  const shares = stock.dilutedShares || stock.sharesOutstanding;

  // DCF
  const dcfTarget = computeDCF({
    ttmFCF: stock.ttmFCF || stock.freeCashFlow,
    sharesOutstanding: shares,
    growthRate,
    terminalRate,
    wacc,
    years: 5,
  });

  // EV/Sales
  const evSalesTarget = computeEVSales({
    ttmRevenue: stock.ttmRevenue || stock.revenueCurrent,
    historicalEVSales: stock.historicalEVSales5YrAvg,
    netDebt,
    sharesOutstanding: shares,
    sector: stock.sector,
  });

  // EV/EBITDA
  const evEbitdaTarget = computeEVEBITDA({
    ttmEBITDA: stock.ttmEBITDA,
    historicalEVEBITDA: stock.historicalEVEBITDA5YrAvg,
    netDebt,
    sharesOutstanding: shares,
    sector: stock.sector,
  });

  // Average of available methods
  const targets = [dcfTarget, evSalesTarget, evEbitdaTarget].filter(t => t != null);
  if (targets.length === 0) return null;

  const avgTarget = Math.round(targets.reduce((a, b) => a + b, 0) / targets.length * 100) / 100;
  const avgUpside = Math.round(((avgTarget - currentPrice) / currentPrice) * 10000) / 100;

  // WACC risk tier
  let waccTier;
  if (wacc <= 5) waccTier = 'LOW';
  else if (wacc <= 7) waccTier = 'MODERATE';
  else if (wacc <= 9) waccTier = 'ELEVATED';
  else waccTier = 'HIGH';

  // TLI Rating
  let rating;
  if (avgUpside > 15) rating = 'BUY';
  else if (avgUpside > 7) rating = 'OVERWEIGHT';
  else if (avgUpside > 0) rating = 'HOLD';
  else rating = 'NEUTRAL';

  const upside = (target) => target != null
    ? Math.round(((target - currentPrice) / currentPrice) * 10000) / 100
    : null;

  return {
    dcf: { target: dcfTarget, upside: upside(dcfTarget), growthRate, terminalRate },
    evSales: { target: evSalesTarget, upside: upside(evSalesTarget), multiple: stock.historicalEVSales5YrAvg || SECTOR_EV_SALES[stock.sector] || 3.0 },
    evEbitda: { target: evEbitdaTarget, upside: upside(evEbitdaTarget), multiple: stock.historicalEVEBITDA5YrAvg || SECTOR_EV_EBITDA[stock.sector] || 12.0 },
    avgTarget,
    avgUpside,
    rating,
    waccTier,
    wacc,
    currentPrice,
  };
}

// ═══════════════════════════════════════════
// VALUATION → SCORE INTEGRATION
// ═══════════════════════════════════════════

function scoreValuation(valuation) {
  if (!valuation) return { pts: 0, flags: [], rating: null };
  let pts = 0;
  const flags = [];

  const dcfUp = valuation.dcf?.upside;
  const evSUp = valuation.evSales?.upside;
  const evEUp = valuation.evEbitda?.upside;

  // Collect available upsides (handle null pillars gracefully)
  const availableUpsides = [dcfUp, evSUp, evEUp].filter(u => u != null);
  const allAbove = (threshold) => availableUpsides.length >= 2 && availableUpsides.every(u => u > threshold);
  const anyBelow = (threshold) => availableUpsides.some(u => u < threshold);

  // Multiple methods agree on >15% upside
  if (allAbove(15)) {
    pts += 10; flags.push('STRONG_UNDERVALUATION');
  }
  // Multiple methods agree on >10% upside
  else if (allAbove(10)) {
    pts += 7; flags.push('MODERATE_UNDERVALUATION');
  }
  // Avg 5-10%
  else if (valuation.avgUpside > 5) {
    pts += 3;
  }

  // Any method shows >10% downside
  if (anyBelow(-10)) {
    pts -= 5; flags.push('OVERVALUATION_WARNING');
  }
  // DCF >20% downside (strongest signal)
  if (dcfUp != null && dcfUp < -20) {
    pts -= 10; flags.push('SIGNIFICANTLY_OVERVALUED');
  }

  // WACC risk adjustment
  if (valuation.waccTier === 'ELEVATED') pts -= 2;
  if (valuation.waccTier === 'HIGH') pts -= 4;

  return { pts, flags, rating: valuation.rating };
}

// ═══════════════════════════════════════════
// DATABASE OPERATIONS
// ═══════════════════════════════════════════

async function saveValuation(ticker, valuation) {
  const today = new Date().toISOString().split('T')[0];
  const row = {
    ticker,
    computed_date: today,
    dcf_growth_rate: valuation.dcf?.growthRate ?? null,
    dcf_terminal_rate: valuation.dcf?.terminalRate ?? null,
    dcf_wacc: valuation.wacc,
    dcf_price_target: valuation.dcf?.target ?? null,
    dcf_upside_pct: valuation.dcf?.upside ?? null,
    ev_sales_multiple: valuation.evSales?.multiple ?? null,
    ev_sales_price_target: valuation.evSales?.target ?? null,
    ev_sales_upside_pct: valuation.evSales?.upside ?? null,
    ev_ebitda_multiple: valuation.evEbitda?.multiple ?? null,
    ev_ebitda_price_target: valuation.evEbitda?.target ?? null,
    ev_ebitda_upside_pct: valuation.evEbitda?.upside ?? null,
    avg_price_target: valuation.avgTarget,
    avg_upside_pct: valuation.avgUpside,
    tli_rating: valuation.rating,
    wacc_risk_tier: valuation.waccTier,
    current_price: valuation.currentPrice,
  };

  const { error } = await supabase
    .from('stock_valuations')
    .upsert(row, { onConflict: 'ticker,computed_date' });

  if (error) console.error(`[Valuation] Save failed for ${ticker}:`, error.message);
}

async function getValuation(ticker) {
  const { data, error } = await supabase
    .from('stock_valuations')
    .select('*')
    .eq('ticker', ticker)
    .order('computed_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[Valuation] Fetch failed for ${ticker}:`, error.message);
    return null;
  }
  return data;
}

async function computeAndSaveValuation(ticker) {
  // Fetch stock data from screener_results
  const { data: stock, error } = await supabase
    .from('screener_results')
    .select('*')
    .eq('ticker', ticker)
    .maybeSingle();

  if (error || !stock) {
    console.error(`[Valuation] No data for ${ticker}`);
    return null;
  }

  const input = {
    currentPrice: stock.current_price,
    sector: stock.sector,
    marketCap: stock.market_cap,
    debtToEquity: stock.debt_to_equity,
    totalDebt: stock.total_debt,
    cashAndEquivalents: stock.cash_and_equivalents,
    freeCashFlow: stock.free_cash_flow,
    ttmFCF: stock.free_cash_flow,
    revenueCurrent: stock.revenue_current,
    ttmRevenue: stock.revenue_current,
    revenueGrowth3YrAvg: stock.revenue_growth_3yr,
    fcfGrowth3YrAvg: stock.fcf_growth_yoy, // approximation
    dilutedShares: stock.diluted_shares,
    sharesOutstanding: stock.shares_outstanding,
    // Historical multiples (defaults used if not available)
    historicalEVSales5YrAvg: stock.historical_ev_sales || null,
    historicalEVEBITDA5YrAvg: stock.historical_ev_ebitda || null,
    ttmEBITDA: stock.ttm_ebitda || null,
  };

  const valuation = computeThreePillarValuation(input);
  if (!valuation) return null;

  await saveValuation(ticker, valuation);
  return valuation;
}

async function batchComputeValuations() {
  const { data: stocks, error } = await supabase
    .from('screener_results')
    .select('ticker')
    .not('signal', 'eq', 'PASS')
    .order('total_score', { ascending: false });

  if (error || !stocks) {
    console.error('[Valuation] Batch fetch failed:', error?.message);
    return { computed: 0, failed: 0 };
  }

  let computed = 0;
  let failed = 0;

  for (const { ticker } of stocks) {
    try {
      const result = await computeAndSaveValuation(ticker);
      if (result) computed++;
      else failed++;
    } catch (err) {
      console.error(`[Valuation] ${ticker} error:`, err.message);
      failed++;
    }
  }

  console.log(`[Valuation] Batch complete: ${computed} computed, ${failed} failed`);
  return { computed, failed };
}

module.exports = {
  computeThreePillarValuation,
  scoreValuation,
  estimateWACC,
  estimateGrowthRate,
  estimateTerminalRate,
  computeDCF,
  computeEVSales,
  computeEVEBITDA,
  saveValuation,
  getValuation,
  computeAndSaveValuation,
  batchComputeValuations,
};
