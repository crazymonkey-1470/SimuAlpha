/**
 * Skill: scan_politicians — Sprint 9A
 *
 * Scrapes politician trade data from QuiverQuant API.
 * Applies committee-sector matching for weighted scoring.
 * Deduplicates against existing sain_signals.
 */

const { scrapeQuiverQuant, scoreCommitteeMatch, filingDelay } = require('../../services/politician_scraper');
const supabase = require('../../services/supabase');

async function execute() {
  const trades = await scrapeQuiverQuant();
  if (trades.length === 0) return { trades_found: 0 };

  let stored = 0;
  let committeeMatches = 0;

  for (const trade of trades) {
    // Check for duplicates
    const { data: existing } = await supabase.from('sain_signals')
      .select('id')
      .eq('ticker', trade.ticker)
      .eq('politician_name', trade.politician_name)
      .eq('signal_date', trade.trade_date)
      .limit(1);

    if (existing && existing.length > 0) continue;

    // Look up stock sector for committee matching
    const { data: stock } = await supabase.from('screener_results')
      .select('sector')
      .eq('ticker', trade.ticker)
      .limit(1)
      .single();

    const committee = scoreCommitteeMatch(trade.politician_name, stock?.sector);
    const delay = filingDelay(trade.trade_date, trade.disclosure_date);

    await supabase.from('sain_signals').insert({
      ticker: trade.ticker,
      direction: trade.direction,
      conviction: committee.match ? 'HIGH' : 'MEDIUM',
      signal_date: trade.trade_date,
      politician_name: trade.politician_name,
      politician_party: trade.party,
      politician_chamber: trade.chamber,
      trade_amount_range: trade.trade_amount_range,
      committee_sector_match: committee.match,
      filing_delay_days: delay,
      quality_score: committee.match ? 0.9 : 0.6,
    });

    stored++;
    if (committee.match) committeeMatches++;
  }

  return { trades_found: stored, committee_matches: committeeMatches };
}

module.exports = { execute };
