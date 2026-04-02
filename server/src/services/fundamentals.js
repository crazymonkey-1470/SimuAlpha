const FMP_BASE = 'https://financialmodelingprep.com/api/v3';

/**
 * Fetch fundamental data from Financial Modeling Prep.
 */
export async function getFundamentals(ticker) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    console.warn('[TLI] FMP_API_KEY not set, skipping fundamental data');
    return null;
  }

  try {
    const [profileRes, incomeRes] = await Promise.all([
      fetch(`${FMP_BASE}/profile/${ticker}?apikey=${apiKey}`),
      fetch(`${FMP_BASE}/income-statement/${ticker}?period=annual&limit=3&apikey=${apiKey}`),
    ]);

    const profile = await profileRes.json();
    const income = await incomeRes.json();

    const companyProfile = Array.isArray(profile) ? profile[0] : profile;
    const incomeStatements = Array.isArray(income) ? income : [];

    const peRatio = companyProfile?.pe || null;
    const psRatio = companyProfile?.priceToSalesRatio || null;
    const sector = companyProfile?.sector || null;
    const companyName = companyProfile?.companyName || null;

    // Revenue: most recent and prior year
    const revenueCurrent = incomeStatements[0]?.revenue || null;
    const revenuePrior = incomeStatements[1]?.revenue || null;

    let revenueGrowthPct = null;
    if (revenueCurrent != null && revenuePrior != null && revenuePrior !== 0) {
      revenueGrowthPct = ((revenueCurrent - revenuePrior) / Math.abs(revenuePrior)) * 100;
    }

    return {
      companyName,
      sector,
      peRatio,
      psRatio,
      revenueCurrent,
      revenuePrior,
      revenueGrowthPct,
    };
  } catch (err) {
    console.error(`[TLI] Failed to fetch fundamentals for ${ticker}:`, err.message);
    return null;
  }
}
