/**
 * Politician Trade Scraper — Sprint 9A
 *
 * Scrapes politician trade data from QuiverQuant API.
 * Includes committee-sector matching for weighted scoring.
 */

const supabase = require('./supabase');

// Committee → GICS sector mapping for scoring
// A politician buying a stock in their committee's jurisdiction = +5 (not +2)
const COMMITTEE_SECTOR_MAP = {
  'Armed Services':               ['Industrials', 'Aerospace & Defense'],
  'Health':                        ['Health Care'],
  'Energy and Natural Resources':  ['Energy'],
  'Energy and Commerce':           ['Energy', 'Health Care', 'Information Technology', 'Communication Services'],
  'Finance':                       ['Financials'],
  'Financial Services':            ['Financials'],
  'Banking':                       ['Financials', 'Real Estate'],
  'Commerce':                      ['Consumer Discretionary', 'Information Technology', 'Communication Services'],
  'Agriculture':                   ['Consumer Staples', 'Materials'],
  'Intelligence':                  ['Information Technology', 'Industrials'],
  'Judiciary':                     ['Information Technology', 'Communication Services'],
  'Appropriations':                ['ALL'],
  'Ways and Means':                ['ALL'],
  'Budget':                        ['ALL'],
};

// High-priority politicians (leadership + known active traders)
const PRIORITY_POLITICIANS = {
  'Nancy Pelosi':           { party: 'D', chamber: 'HOUSE', committees: ['Appropriations'], multiplier: 1.5 },
  'Tommy Tuberville':       { party: 'R', chamber: 'SENATE', committees: ['Armed Services', 'Agriculture'], multiplier: 1.3 },
  'Marjorie Taylor Greene': { party: 'R', chamber: 'HOUSE', committees: ['Homeland Security'], multiplier: 1.2 },
  'Dan Crenshaw':           { party: 'R', chamber: 'HOUSE', committees: ['Energy and Commerce', 'Intelligence'], multiplier: 1.2 },
  'Josh Gottheimer':        { party: 'D', chamber: 'HOUSE', committees: ['Financial Services'], multiplier: 1.2 },
  'Mark Green':             { party: 'R', chamber: 'HOUSE', committees: ['Armed Services', 'Homeland Security'], multiplier: 1.1 },
  'Michael McCaul':         { party: 'R', chamber: 'HOUSE', committees: ['Foreign Affairs'], multiplier: 1.1 },
};

/**
 * Scrape from QuiverQuant API (preferred — structured data).
 */
async function scrapeQuiverQuant() {
  const apiKey = process.env.QUIVERQUANT_API_KEY;
  if (!apiKey) {
    console.warn('[SAIN] QUIVERQUANT_API_KEY not set, skipping');
    return [];
  }

  try {
    const res = await fetch('https://api.quiverquant.com/beta/live/congresstrading', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const trades = await res.json();

    return trades.slice(0, 100).map(t => ({
      politician_name: t.Representative,
      ticker: t.Ticker,
      direction: t.Transaction?.toLowerCase().includes('purchase') ? 'BUY' : 'SELL',
      trade_date: t.TransactionDate,
      disclosure_date: t.DisclosureDate,
      trade_amount_range: t.Range || t.Amount,
      chamber: t.House === 'Senate' ? 'SENATE' : 'HOUSE',
      party: t.Party?.[0],
    }));
  } catch (err) {
    console.error('[SAIN] QuiverQuant error:', err.message);
    return [];
  }
}

/**
 * Check if a politician's trade matches their committee jurisdiction.
 */
function scoreCommitteeMatch(politicianName, stockSector) {
  const politician = PRIORITY_POLITICIANS[politicianName];

  if (!politician) {
    return { match: false, bonus: 2, multiplier: 1.0 };
  }

  for (const committee of politician.committees) {
    const sectors = COMMITTEE_SECTOR_MAP[committee] || [];
    if (sectors.includes('ALL') || sectors.some(s =>
      stockSector?.toLowerCase().includes(s.toLowerCase())
    )) {
      return {
        match: true,
        bonus: 5,
        committee,
        multiplier: politician.multiplier,
      };
    }
  }

  return { match: false, bonus: 2, multiplier: politician.multiplier };
}

/**
 * Calculate filing delay in days.
 */
function filingDelay(tradeDate, disclosureDate) {
  if (!tradeDate || !disclosureDate) return null;
  return Math.floor((new Date(disclosureDate) - new Date(tradeDate)) / 86400000);
}

module.exports = { scrapeQuiverQuant, scoreCommitteeMatch, filingDelay, COMMITTEE_SECTOR_MAP, PRIORITY_POLITICIANS };
