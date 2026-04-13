/**
 * Stock Data Assembly — Robust merger of screener_results + live fetcher data.
 *
 * Reads from screener_results as the base, then supplements with fresh
 * fetcher data from the scraper service to fill any gaps.
 */

const supabase = require('./supabase');
const { fetchFundamentals, fetchHistoricalPrices } = require('./fetcher');
const log = require('./logger').child({ module: 'stock_data' });

/**
 * Assemble a complete stock data object for a given ticker.
 * Returns camelCase properties ready for the v3 scorer and skill chain.
 */
async function getStockData(ticker) {
  // Read from screener_results
  const { data: sr } = await supabase
    .from('screener_results')
    .select('*')
    .eq('ticker', ticker)
    .single();

  // Always fetch fresh from scraper as supplement
  let fundamentals = {};
  let historical = {};
  try {
    fundamentals = (await fetchFundamentals(ticker)) || {};
  } catch (e) {
    log.warn({ err: e, ticker }, 'Fetcher fundamentals failed');
  }
  try {
    historical = (await fetchHistoricalPrices(ticker)) || {};
  } catch (e) {
    log.warn({ err: e, ticker }, 'Fetcher historical failed');
  }

  if (!sr && !fundamentals.currentPrice) {
    throw new Error(`${ticker} not found in screener_results and scraper fetch failed.`);
  }

  // Use whichever source has real data (non-null, non-zero)
  const pick = (srField, fetcherField) => {
    const srVal = sr?.[srField];
    const fVal = fundamentals?.[fetcherField];
    if (srVal != null && srVal !== 0) return srVal;
    if (fVal != null && fVal !== 0) return fVal;
    return srVal ?? fVal ?? null;
  };

  const data = {
    ticker,
    companyName: sr?.company_name || fundamentals?.companyName || ticker,
    sector: sr?.sector || fundamentals?.sector || 'Unknown',
    currentPrice: pick('current_price', 'currentPrice'),
    marketCap: pick('market_cap', 'marketCap'),

    // Earnings
    epsDiluted: pick('eps_gaap', 'epsDiluted') ?? pick('eps_diluted', 'epsDiluted'),
    netIncome: pick('net_income', 'netIncome'),
    operatingIncome: pick('operating_income', 'operatingIncome'),
    operatingMargin: pick('operating_margin', 'operatingMargin'),

    // Cash flow
    freeCashFlow: pick('free_cash_flow', 'freeCashFlow'),
    fcfMargin: pick('fcf_margin', 'fcfMargin'),
    fcfGrowthYoY: pick('fcf_growth_yoy', 'fcfGrowthYoY'),

    // Growth
    revenueGrowthYoY: pick('revenue_growth_pct', 'revenueGrowthPct'),
    revenueGrowth3YrAvg: sr?.revenue_growth_3yr_avg ?? sr?.revenue_growth_3yr ?? fundamentals?.revenueGrowth3YrAvg ?? null,
    epsGrowthYoY: sr?.eps_growth_yoy ?? null,
    epsGrowth5Yr: sr?.eps_growth_5yr ?? null,
    epsGrowthQoQ: sr?.eps_growth_qoq ?? null,
    epsGrowthPriorQoQ: sr?.eps_growth_prior_qoq ?? null,
    revenueGrowthPriorYoY: sr?.revenue_growth_prior_year ?? null,
    revenueCurrent: sr?.revenue_current ?? fundamentals?.revenueCurrent ?? null,
    revenuePriorYear: sr?.revenue_prior_year ?? fundamentals?.revenuePrior ?? null,

    // Valuation
    peRatio: pick('pe_ratio', 'peRatio'),
    psRatio: pick('ps_ratio', 'psRatio'),
    forwardPE: sr?.forward_pe ?? null,

    // Balance sheet
    debtToEquity: pick('debt_to_equity', 'debtToEquity'),
    totalDebt: pick('total_debt', 'totalDebt'),
    cashAndEquivalents: pick('cash_equivalents', 'cashAndEquivalents') ?? pick('cash_and_equivalents', 'cashAndEquivalents'),
    currentRatio: sr?.current_ratio ?? null,
    ttmEBITDA: pick('ttm_ebitda', 'ebitda'),

    // Margins
    grossMarginCurrent: pick('gross_margin', 'grossMarginCurrent') ?? pick('gross_margin_current', 'grossMarginCurrent'),
    grossMarginPriorYear: sr?.gross_margin_prior_year ?? null,

    // Technical
    sma50: pick('ma_50d', 'sma50'),
    sma200: sr?.ma_200d ?? sr?.price_200mma ?? null,
    wma200: sr?.price_200wma ?? null,
    mma200: sr?.price_200mma ?? null,
    week52High: pick('week_52_high', 'week52High'),
    week52Low: sr?.week_52_low ?? null,

    // Price history — critical for wave analysis
    weeklyCloses: historical?.weeklyCloses || [],
    monthlyCloses: historical?.monthlyCloses || [],
    weeklyRaw: historical?.weeklyRaw || [],
    monthlyRaw: historical?.monthlyRaw || [],
    weeklyVolumes: historical?.weeklyVolumes || [],

    // Shares
    sharesOutstanding: pick('shares_outstanding', 'sharesOutstanding'),
    dilutedShares: pick('diluted_shares', 'dilutedShares'),
    dividendYield: sr?.dividend_yield ?? null,
    sharesOutstandingChange: pick('shares_outstanding_change', 'sharesOutstandingChange'),

    // Score from screener (fallback)
    tliScore: sr?.tli_score ?? sr?.total_score ?? 0,
    fundamentalScore: sr?.fundamental_score ?? null,
    technicalScore: sr?.technical_score ?? null,
    signal: sr?.signal ?? 'UNKNOWN',

    // Flags and enrichment
    insiderNetBuying: sr?.insider_net_buying ?? null,
    daysToEarnings: sr?.days_to_earnings ?? null,
    confluenceZone: sr?.confluence_zone ?? false,
    entryZone: sr?.entry_zone ?? false,
    generationalBuy: sr?.generational_buy ?? false,
    deathCross: sr?.death_cross ?? false,
    moatTier: sr?.moat_tier ?? null,
    badges: sr?.badges ?? [],
    totalScore: sr?.total_score ?? 0,

    // Valuation targets from screener
    avgPriceTarget: sr?.avg_price_target ?? null,
    avgUpsidePct: sr?.avg_upside_pct ?? null,

    // Pass-through for specific pipeline needs
    beta: sr?.beta ?? 1.0,
    capex: sr?.capex ?? fundamentals?.capex ?? null,
    netIncomePriorYear: sr?.net_income_prior_year ?? null,

    // Kill thesis flags
    patentCliff: sr?.patent_cliff ?? false,
    regulatoryAction: sr?.regulatory_action ?? false,
    tariffExposure: sr?.tariff_exposure ?? 0,
    dataBreach: sr?.data_breach ?? false,
    keyPersonRisk: sr?.key_person_risk ?? false,
    accountingAllegations: sr?.accounting_allegations ?? false,
    gaapNongaapDivergence: sr?.gaap_nongaap_divergence ?? 0,

    // Multiple compression
    evSales5YrAvg: sr?.ev_sales_5yr_avg ?? null,
    currentEVSales: sr?.current_ev_sales ?? null,

    // Raw screener row for pass-through fields
    _raw: sr,
  };

  log.info({
    ticker,
    hasEps: !!data.epsDiluted,
    hasFcf: !!data.freeCashFlow,
    hasWeekly: data.weeklyCloses?.length || 0,
    hasSma50: !!data.sma50,
    price: data.currentPrice,
  }, 'Stock data assembled for analysis');

  return data;
}

module.exports = { getStockData };
