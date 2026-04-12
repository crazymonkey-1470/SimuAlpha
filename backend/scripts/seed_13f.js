/**
 * Seed 13F Data — Sprint 7
 *
 * Seeds Q4 2025 holdings for 4 super investors based on
 * TLI Money Flow Research reports (13F filings).
 *
 * Run: node scripts/seed_13f.js
 */
require('dotenv').config();
const supabase = require('../services/supabase');
const { computeConsensus } = require('../services/institutional');

const QUARTER = '2025Q4';

// ═══════════════════════════════════════════
// HOLDINGS DATA (from TLI Money Flow Research)
// ═══════════════════════════════════════════

const BERKSHIRE_HOLDINGS = [
  { ticker: 'AAPL', shares: null, market_value: 61961735283, signal_type: 'REDUCE', pct_of_portfolio: 22.57, has_call_options: false, notes: '3rd consecutive Q reduction from 40% to 22.6%' },
  { ticker: 'AXP', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: 18.76, has_call_options: false, notes: 'Unchanged' },
  { ticker: 'BAC', shares: null, market_value: 28451276370, signal_type: 'REDUCE', pct_of_portfolio: 10.38, has_call_options: false, notes: '-8.94% shares, ~50% total reduction since Q3-24' },
  { ticker: 'KO', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: 9.88, has_call_options: false, notes: 'Legacy hold, dividend income' },
  { ticker: 'CVX', shares: 130156362, market_value: 19837131131, signal_type: 'ADD', pct_of_portfolio: 7.24, has_call_options: false, notes: 'DCA 3rd consecutive quarter, $1.23B add, owns 6.46% of CVX' },
  { ticker: 'OXY', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: 4.69, has_call_options: false, notes: 'Energy exposure via OxyChem' },
  { ticker: 'MCO', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: 4.39, has_call_options: false, notes: '' },
  { ticker: 'CB', shares: 34249183, market_value: 10689854998, signal_type: 'ADD', pct_of_portfolio: 3.90, has_call_options: false, notes: '$910M add, 2916288 shares added, owns 8.59% of CB' },
  { ticker: 'KHC', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: 3.19, has_call_options: false, notes: '' },
  { ticker: 'NYT', shares: 5065744, market_value: 351663948, signal_type: 'NEW_BUY', pct_of_portfolio: 0.13, has_call_options: false, notes: 'New position Q4, owns 3.11% of NYT' },
  { ticker: 'DPZ', shares: 3350000, market_value: 1396347000, signal_type: 'ADD', pct_of_portfolio: 0.51, has_call_options: false, notes: 'DCA all 6 quarters, owns 9.87% of DPZ' },
  { ticker: 'AMZN', shares: null, market_value: 525346320, signal_type: 'REDUCE', pct_of_portfolio: 0.19, has_call_options: false, notes: '-77.24% trim' },
  { ticker: 'LAMR', shares: 1202410, market_value: 152201058, signal_type: 'ADD', pct_of_portfolio: 0.06, has_call_options: false, notes: 'Dividend reinvestment only' },
];

const TEPPER_HOLDINGS = [
  { ticker: 'BABA', company_name: 'Alibaba Group', shares: 10000000, market_value: 1320000000, pct_of_portfolio: 18.5 },
  { ticker: 'GOOGL', company_name: 'Alphabet Inc', shares: 2400000, market_value: 480000000, pct_of_portfolio: 6.7 },
  { ticker: 'AMZN', company_name: 'Amazon.com', shares: 1500000, market_value: 345000000, pct_of_portfolio: 4.8 },
  { ticker: 'MU', company_name: 'Micron Technology', shares: 3000000, market_value: 270000000, pct_of_portfolio: 3.8, has_call_options: true },
  { ticker: 'META', company_name: 'Meta Platforms', shares: 500000, market_value: 320000000, pct_of_portfolio: 4.5 },
  { ticker: 'TSM', company_name: 'Taiwan Semiconductor', shares: 1500000, market_value: 285000000, pct_of_portfolio: 4.0 },
  { ticker: 'OC', company_name: 'Owens Corning', shares: 1200000, market_value: 210000000, pct_of_portfolio: 2.9 },
  { ticker: 'AMD', company_name: 'AMD Inc', shares: 1500000, market_value: 195000000, pct_of_portfolio: 2.7 },
  { ticker: 'UNH', company_name: 'UnitedHealth Group', shares: 300000, market_value: 168000000, pct_of_portfolio: 2.4 },
  { ticker: 'EWY', company_name: 'iShares MSCI South Korea', shares: 2000000, market_value: 120000000, pct_of_portfolio: 1.7 },
];

const DRUCKENMILLER_HOLDINGS = [
  { ticker: 'NTRA', company_name: 'Natera Inc', shares: 2500000, market_value: 425000000, pct_of_portfolio: 12.1 },
  { ticker: 'XLF', company_name: 'Financial Select Sector SPDR', shares: 5000000, market_value: 240000000, pct_of_portfolio: 6.9 },
  { ticker: 'INSM', company_name: 'Insmed Inc', shares: 2000000, market_value: 160000000, pct_of_portfolio: 4.6 },
  { ticker: 'RSP', company_name: 'Invesco S&P 500 Equal Weight', shares: 800000, market_value: 130000000, pct_of_portfolio: 3.7 },
  { ticker: 'TEVA', company_name: 'Teva Pharmaceutical', shares: 6000000, market_value: 120000000, pct_of_portfolio: 3.4 },
  { ticker: 'GOOGL', company_name: 'Alphabet Inc', shares: 500000, market_value: 100000000, pct_of_portfolio: 2.9 },
  { ticker: 'EWZ', company_name: 'iShares MSCI Brazil', shares: 3000000, market_value: 90000000, pct_of_portfolio: 2.6, has_call_options: true },
  { ticker: 'AMZN', company_name: 'Amazon.com', shares: 300000, market_value: 69000000, pct_of_portfolio: 2.0, has_call_options: true },
];

// Druckenmiller EXITS (from prior quarter)
const DRUCKENMILLER_EXITS = [
  { ticker: 'BAC', shares: 0 },
  { ticker: 'C', shares: 0 },
  { ticker: 'META', shares: 0 },
];

const COLEMAN_HOLDINGS = [
  { ticker: 'MSFT', company_name: 'Microsoft Corp', shares: 5000000, market_value: 2100000000, pct_of_portfolio: 10.5 },
  { ticker: 'SE', company_name: 'Sea Limited', shares: 8000000, market_value: 800000000, pct_of_portfolio: 4.0 },
  { ticker: 'GOOGL', company_name: 'Alphabet Inc', shares: 3000000, market_value: 600000000, pct_of_portfolio: 3.0 },
  { ticker: 'AMZN', company_name: 'Amazon.com', shares: 2500000, market_value: 575000000, pct_of_portfolio: 2.9 },
  { ticker: 'NVDA', company_name: 'NVIDIA Corp', shares: 3000000, market_value: 450000000, pct_of_portfolio: 2.3 },
  { ticker: 'META', company_name: 'Meta Platforms', shares: 600000, market_value: 384000000, pct_of_portfolio: 1.9 },
  { ticker: 'NFLX', company_name: 'Netflix Inc', shares: 300000, market_value: 270000000, pct_of_portfolio: 1.4 },
  { ticker: 'MDB', company_name: 'MongoDB Inc', shares: 800000, market_value: 200000000, pct_of_portfolio: 1.0 },
  { ticker: 'UNH', company_name: 'UnitedHealth Group', shares: 200000, market_value: 112000000, pct_of_portfolio: 0.6 },
];

// Coleman EXITS
const COLEMAN_EXITS = [
  { ticker: 'LLY', shares: 0 },
  { ticker: 'NVO', shares: 0 },
];

// ═══════════════════════════════════════════
// SEED LOGIC
// ═══════════════════════════════════════════

async function seedInvestor(cik, holdings, exits = []) {
  // Get investor by CIK
  const { data: investor, error: invErr } = await supabase
    .from('super_investors')
    .select('id, name')
    .eq('cik', cik)
    .maybeSingle();

  if (invErr || !investor) {
    console.error(`  Investor CIK ${cik} not found. Run migration_complete.sql first.`);
    return 0;
  }

  console.log(`\n  Seeding ${investor.name} (${holdings.length} holdings)...`);

  // Calculate total portfolio value
  const totalValue = holdings.reduce((sum, h) => sum + (h.market_value || 0), 0);

  // Build holdings rows
  const holdingsRows = holdings
    .sort((a, b) => b.market_value - a.market_value)
    .map((h, idx) => ({
      investor_id: investor.id,
      quarter: QUARTER,
      ticker: h.ticker,
      company_name: h.company_name,
      shares: h.shares,
      market_value: h.market_value,
      pct_of_portfolio: h.pct_of_portfolio || (totalValue > 0 ? Math.round(h.market_value / totalValue * 10000) / 100 : null),
      portfolio_rank: idx + 1,
      has_call_options: h.has_call_options || false,
      has_put_options: h.has_put_options || false,
    }));

  // Upsert holdings
  const { error: upsertErr } = await supabase
    .from('investor_holdings')
    .upsert(holdingsRows, { onConflict: 'investor_id,quarter,ticker' });

  if (upsertErr) {
    console.error(`  Holdings upsert error for ${investor.name}:`, upsertErr.message);
    return 0;
  }

  // Update portfolio value on investor
  await supabase
    .from('super_investors')
    .update({ portfolio_value_latest: totalValue })
    .eq('id', investor.id);

  // Build signals by comparing to prior quarter (2025Q3)
  const { data: priorHoldings } = await supabase
    .from('investor_holdings')
    .select('*')
    .eq('investor_id', investor.id)
    .eq('quarter', '2025Q3');

  const signals = [];

  // Current holdings → signals
  const priorMap = {};
  if (priorHoldings) {
    for (const h of priorHoldings) priorMap[h.ticker] = h;
  }

  for (const curr of holdingsRows) {
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

    let conviction = 'LOW';
    if (curr.has_call_options && (signalType === 'NEW_BUY' || signalType === 'ADD')) conviction = 'EXTREME';
    else if (signalType === 'NEW_BUY' && curr.market_value > 1e9) conviction = 'EXTREME';
    else if (signalType === 'NEW_BUY' && curr.market_value > 500e6) conviction = 'HIGH';
    else if (signalType === 'ADD' && pctChange > 50) conviction = 'HIGH';
    else if (signalType === 'ADD' && pctChange > 20) conviction = 'MODERATE';

    signals.push({
      investor_id: investor.id,
      ticker: curr.ticker,
      quarter: QUARTER,
      signal_type: signalType,
      shares_changed: sharesChanged,
      pct_change: pctChange,
      conviction_level: conviction,
    });
  }

  // Handle explicit exits
  for (const exit of exits) {
    signals.push({
      investor_id: investor.id,
      ticker: exit.ticker,
      quarter: QUARTER,
      signal_type: 'EXIT',
      shares_changed: -(priorMap[exit.ticker]?.shares || 0),
      pct_change: -100,
      conviction_level: 'HIGH',
    });
  }

  // Upsert signals
  if (signals.length > 0) {
    const { error: sigErr } = await supabase
      .from('investor_signals')
      .upsert(signals, { onConflict: 'investor_id,quarter,ticker' });
    if (sigErr) console.error(`  Signals upsert error:`, sigErr.message);
  }

  const newBuys = signals.filter(s => s.signal_type === 'NEW_BUY').length;
  const exitCount = signals.filter(s => s.signal_type === 'EXIT').length;
  console.log(`  ${investor.name}: ${holdingsRows.length} holdings, ${signals.length} signals (${newBuys} new buys, ${exitCount} exits)`);
  return holdingsRows.length;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(`Seeding 13F Data for ${QUARTER}`);
  console.log('═══════════════════════════════════════════');

  let total = 0;

  // Berkshire Hathaway (Greg Abel)
  total += await seedInvestor('0001067983', BERKSHIRE_HOLDINGS);

  // Appaloosa (David Tepper)
  total += await seedInvestor('0001656456', TEPPER_HOLDINGS);

  // Duquesne (Stanley Druckenmiller)
  total += await seedInvestor('0001536411', DRUCKENMILLER_HOLDINGS, DRUCKENMILLER_EXITS);

  // Tiger Global (Chase Coleman)
  total += await seedInvestor('0001167483', COLEMAN_HOLDINGS, COLEMAN_EXITS);

  console.log(`\nTotal holdings seeded: ${total}`);

  // Compute consensus across all investors
  console.log('\nComputing cross-investor consensus...');
  await computeConsensus();

  console.log('\n13F seed complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
