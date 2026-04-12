/**
 * Seed 13F Data — Sprint 7
 *
 * Seeds holdings for 8 super investors based on
 * TLI Money Flow Research reports (13F filings).
 * - Berkshire, Appaloosa, Duquesne, Tiger Global: full verified data
 * - Oaktree, Tudor, Coatue, Point72: PARTIAL data from cross-investor consensus
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
  { ticker: 'AAPL', shares: null, market_value: 61961735283, signal_type: 'REDUCE', pct_of_portfolio: 22.57, has_call_options: false, notes: '3rd consecutive Q reduction from 40% to 22.6%, -4.32% shares, tech aversion + tax efficiency + cash building' },
  { ticker: 'AXP', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: 18.76, has_call_options: false, notes: 'Unchanged' },
  { ticker: 'BAC', shares: null, market_value: 28451276370, signal_type: 'REDUCE', pct_of_portfolio: 10.38, has_call_options: false, notes: '-8.94% shares, ~50% total reduction since Q3-24, rate sensitivity' },
  { ticker: 'KO', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: 9.88, has_call_options: false, notes: 'Legacy hold, dividend income' },
  { ticker: 'CVX', shares: 130156362, market_value: 19837131131, signal_type: 'ADD', pct_of_portfolio: 7.24, has_call_options: false, notes: 'DCA 3rd consecutive quarter, $1.23B add, 3.9% dividend, $14B/yr buybacks, owns 6.46% of CVX' },
  { ticker: 'OXY', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: 4.69, has_call_options: false, notes: 'Energy exposure via OxyChem' },
  { ticker: 'MCO', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: 4.39, has_call_options: false, notes: '' },
  { ticker: 'CB', shares: 34249183, market_value: 10689854998, signal_type: 'ADD', pct_of_portfolio: 3.90, has_call_options: false, notes: '$910M add, 2916288 shares added, P/E 13x fwd, Beta 0.53x, owns 8.59% of CB' },
  { ticker: 'KHC', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: 3.19, has_call_options: false, notes: '' },
  { ticker: 'NYT', shares: 5065744, market_value: 351663948, signal_type: 'NEW_BUY', pct_of_portfolio: 0.13, has_call_options: false, notes: 'New position Q4, digital subscriber 13.1% 3yr CAGR, revenue +10% YoY, FCF +44.7% YoY, owns 3.11% of NYT' },
  { ticker: 'DPZ', shares: 3350000, market_value: 1396347000, signal_type: 'ADD', pct_of_portfolio: 0.51, has_call_options: false, notes: '368055 shares added, DCA all 6 quarters since Q3-24, avg buy $443, owns 9.87% of DPZ' },
  { ticker: 'AMZN', shares: null, market_value: 525346320, signal_type: 'REDUCE', pct_of_portfolio: 0.19, has_call_options: false, notes: '-77.24% trim (7724000 shares sold), AI bubble exposure planning, $200B capex concern' },
  { ticker: 'LAMR', shares: 1202410, market_value: 152201058, signal_type: 'ADD', pct_of_portfolio: 0.06, has_call_options: false, notes: 'Immaterial add of 300 shares, dividend reinvestment only, 4.5-5% yield' },
];

const TEPPER_HOLDINGS = [
  { ticker: 'BABA', shares: null, market_value: 753117926, signal_type: 'REDUCE', pct_of_portfolio: 10.88, has_call_options: false, notes: '3rd consecutive Q reduction -20%, risk/reward matured, bought ~$80 now $150, still #1 position' },
  { ticker: 'GOOGL', shares: 1786931, market_value: 560738948, signal_type: 'ADD', pct_of_portfolio: 8.10, has_call_options: false, notes: '+399431 shares, proprietary TPUs, Gemini LLM, $73.3B FCF, avg buy ~$121.80' },
  { ticker: 'AMZN', shares: null, market_value: 503047031, signal_type: 'REDUCE', pct_of_portfolio: 7.26, has_call_options: false, notes: '-13% (-320609 shares)' },
  { ticker: 'MU', shares: 1500000, market_value: 428115000, signal_type: 'ADD', pct_of_portfolio: 6.18, has_call_options: true, notes: '+1000000 shares (+200%), AI memory bottleneck thesis, avg buy ~$166.83, also loaded MU call options = EXTREME conviction' },
  { ticker: 'META', shares: 600000, market_value: 396054000, signal_type: 'ADD', pct_of_portfolio: 5.72, has_call_options: false, notes: '+230000 shares, best AI use case for ad targeting, lowest fwd P/E of Mag 7, 82% gross margin' },
  { ticker: 'TSM', shares: 1130000, market_value: 343395700, signal_type: 'ADD', pct_of_portfolio: 4.96, has_call_options: false, notes: '+70000 shares, avg buy ~$170.88' },
  { ticker: 'NVDA', shares: null, market_value: 317050000, signal_type: 'REDUCE', pct_of_portfolio: 4.58, has_call_options: false, notes: '-200000 shares (-11%), rotation from AI hardware to memory' },
  { ticker: 'WHR', shares: null, market_value: 282067400, signal_type: 'REDUCE', pct_of_portfolio: 4.07, has_call_options: false, notes: '-1590000 shares (-29%), underperforming, Tepper wrote activist letter criticizing board' },
  { ticker: 'NRG', shares: null, market_value: 261153600, signal_type: 'REDUCE', pct_of_portfolio: 3.77, has_call_options: false, notes: '-230000 shares (-12%)' },
  { ticker: 'AAL', shares: 14150000, market_value: 216919500, signal_type: 'ADD', pct_of_portfolio: 3.13, has_call_options: false, notes: '+4900000 shares, transport/recovery play, avg buy ~$12.45' },
  { ticker: 'EWY', shares: 1875000, market_value: 182287500, signal_type: 'NEW_BUY', pct_of_portfolio: 2.63, has_call_options: false, notes: 'Samsung 27% + SK Hynix 21% exposure, AI memory play + Korean discount, avg buy ~$88.07' },
  { ticker: 'QCOM', shares: null, market_value: 195852250, signal_type: 'REDUCE', pct_of_portfolio: 2.83, has_call_options: false, notes: '-100000 shares (-8%), part of AI hardware rotation' },
  { ticker: 'OC', shares: 950000, market_value: 106314500, signal_type: 'ADD', pct_of_portfolio: 1.54, has_call_options: false, notes: '+788500 shares, fwd P/E 9x, cyclical industrial recovery, avg buy ~$128.23' },
  { ticker: 'AMD', shares: null, market_value: 69602000, signal_type: 'REDUCE', pct_of_portfolio: 1.01, has_call_options: false, notes: '-625000 shares (-66%), rotation from AI hardware to memory, one quarter hold' },
  { ticker: 'UNH', shares: null, market_value: 66022000, signal_type: 'REDUCE', pct_of_portfolio: 0.95, has_call_options: false, notes: '-3500 shares (-2%), still holding small position' },
];

const DRUCKENMILLER_HOLDINGS = [
  { ticker: 'NTRA', shares: null, market_value: 575327000, signal_type: 'REDUCE', pct_of_portfolio: 12.75, has_call_options: false, notes: '#1 position, -703175 shares (-21.87%), avg buy $87, trimmed ~$229, +163% gain' },
  { ticker: 'XLF', shares: 5495600, market_value: 300994000, signal_type: 'NEW_BUY', pct_of_portfolio: 6.67, has_call_options: false, notes: '#2 position, financials sector ETF, credit expansion bet, entry ~$53' },
  { ticker: 'INSM', shares: null, market_value: 257884000, signal_type: 'REDUCE', pct_of_portfolio: 5.72, has_call_options: false, notes: '-941683 shares (-38.86%), biotech gains harvested +125%, avg buy $78' },
  { ticker: 'RSP', shares: 1173925, market_value: 224877000, signal_type: 'NEW_BUY', pct_of_portfolio: 4.98, has_call_options: false, notes: 'Equal weight S&P 500, anti-Mag7 concentration, laggard catch-up bet, entry ~$189' },
  { ticker: 'TEVA', shares: null, market_value: 183355000, signal_type: 'REDUCE', pct_of_portfolio: 4.06, has_call_options: false, notes: '-10719065 shares (-64.60%), turnaround complete, P/E doubled from 6x to 12x, avg buy $18' },
  { ticker: 'WWD', shares: null, market_value: 178650000, signal_type: 'REDUCE', pct_of_portfolio: 3.96, has_call_options: false, notes: '-42085 shares (-6.65%), avg buy $143, now $302' },
  { ticker: 'AMZN', shares: 737940, market_value: 170331000, signal_type: 'ADD', pct_of_portfolio: 3.78, has_call_options: true, notes: '+300870 shares (+68.84%), also bought AMZN call options, avg buy ~$225' },
  { ticker: 'TSM', shares: null, market_value: 165038000, signal_type: 'REDUCE', pct_of_portfolio: 3.66, has_call_options: false, notes: '-222000 shares (-29.02%), geopolitical risk Taiwan, avg buy $190' },
  { ticker: 'CPNG', shares: 6772909, market_value: 159773000, signal_type: 'ADD', pct_of_portfolio: 3.54, has_call_options: false, notes: '+2139785 shares (+46.18%), South Korea consumer, avg buy ~$33' },
  { ticker: 'EWZ', shares: 3552575, market_value: 112865000, signal_type: 'NEW_BUY', pct_of_portfolio: 2.50, has_call_options: true, notes: 'Brazil ETF equity + calls ($113M in calls too = $247M total), EM + commodity cycle, entry ~$31' },
  { ticker: 'GOOGL', shares: 385000, market_value: 120505000, signal_type: 'ADD', pct_of_portfolio: 2.67, has_call_options: false, notes: '+282800 shares (+276.71%), lower fwd P/E vs Big Tech peers, avg buy ~$255' },
  { ticker: 'SE', shares: 944120, market_value: 120441000, signal_type: 'ADD', pct_of_portfolio: 2.67, has_call_options: false, notes: '+669920 shares (+244.32%), Southeast Asia tech/gaming/e-commerce, avg buy ~$153' },
  { ticker: 'MELI', shares: null, market_value: 94970000, signal_type: 'REDUCE', pct_of_portfolio: 2.11, has_call_options: false, notes: '-11195 shares (-19.19%)' },
  { ticker: 'BAC', shares: 0, market_value: 0, signal_type: 'EXIT', pct_of_portfolio: 0, has_call_options: false, notes: 'Full exit, macro reassessment, rate sensitivity' },
  { ticker: 'C', shares: 0, market_value: 0, signal_type: 'EXIT', pct_of_portfolio: 0, has_call_options: false, notes: 'Full exit, valuation gap closed, +62%' },
  { ticker: 'META', shares: 0, market_value: 0, signal_type: 'EXIT', pct_of_portfolio: 0, has_call_options: false, notes: 'Full exit' },
  { ticker: 'GEV', shares: 0, market_value: 0, signal_type: 'EXIT', pct_of_portfolio: 0, has_call_options: false, notes: 'Full exit, +13%' },
  { ticker: 'VST', shares: 0, market_value: 0, signal_type: 'EXIT', pct_of_portfolio: 0, has_call_options: false, notes: 'Full exit, -17%' },
  { ticker: 'LLY', shares: 0, market_value: 0, signal_type: 'EXIT', pct_of_portfolio: 0, has_call_options: false, notes: 'Full exit' },
];

const COLEMAN_HOLDINGS = [
  { ticker: 'MSFT', shares: 6551368, market_value: 3393281056, signal_type: 'HOLD', pct_of_portfolio: 10.44, has_call_options: false, notes: '#1 position' },
  { ticker: 'SE', shares: 16041335, market_value: 2867067805, signal_type: 'HOLD', pct_of_portfolio: 8.86, has_call_options: false, notes: '#2 position, Singapore tech/gaming/e-commerce' },
  { ticker: 'GOOGL', shares: 10631402, market_value: 2584493826, signal_type: 'HOLD', pct_of_portfolio: 7.99, has_call_options: false, notes: '#3 position' },
  { ticker: 'AMZN', shares: 11043441, market_value: 2424808340, signal_type: 'ADD', pct_of_portfolio: 7.49, has_call_options: false, notes: '+357900 shares (+3.35%), AWS re-accelerating at 20% YoY, held since 2015' },
  { ticker: 'NVDA', shares: 11709752, market_value: 2184805528, signal_type: 'HOLD', pct_of_portfolio: 6.75, has_call_options: false, notes: '#5 position' },
  { ticker: 'META', shares: 2819001, market_value: 2070217954, signal_type: 'REDUCE', pct_of_portfolio: 6.40, has_call_options: false, notes: '-62.58% reduction (~$3.46B sold), capex concern, Reality Labs misallocation' },
  { ticker: 'RDDT', shares: 4672515, market_value: 1074631725, signal_type: 'REDUCE', pct_of_portfolio: 3.32, has_call_options: false, notes: '-24.01%, profit taking +93%' },
  { ticker: 'AVGO', shares: 2889614, market_value: 953312555, signal_type: 'ADD', pct_of_portfolio: 2.95, has_call_options: false, notes: '+186400 shares (+6.90%)' },
  { ticker: 'FLUT', shares: 3658192, market_value: 929180768, signal_type: 'ADD', pct_of_portfolio: 2.87, has_call_options: false, notes: '+204800 shares (+5.93%)' },
  { ticker: 'CPAY', shares: 1771146, market_value: 510196317, signal_type: 'ADD', pct_of_portfolio: 1.58, has_call_options: false, notes: '+269500 shares (+17.95%), fwd P/E 11.5x, avg buy ~$266' },
  { ticker: 'CPNG', shares: 15837579, market_value: 509970044, signal_type: 'ADD', pct_of_portfolio: 1.58, has_call_options: false, notes: '+2252000 shares (+16.58%), Amazon of South Korea' },
  { ticker: 'NFLX', shares: 2019000, market_value: 242061948, signal_type: 'NEW_BUY', pct_of_portfolio: 0.75, has_call_options: false, notes: 'New buy, subscriber 19% 9yr CAGR, avg buy ~$122.66' },
  { ticker: 'MDB', shares: 341000, market_value: 105839580, signal_type: 'NEW_BUY', pct_of_portfolio: 0.33, has_call_options: false, notes: 'New buy, 71% gross margin, 23% FCF margin, avg buy ~$245' },
  { ticker: 'UNH', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: 0.50, has_call_options: false, notes: 'Healthcare undervalued play' },
  { ticker: 'LLY', shares: 0, market_value: 0, signal_type: 'EXIT', pct_of_portfolio: 0, has_call_options: false, notes: 'Full exit, GLP-1 valuations stretched, avg buy ~$587' },
  { ticker: 'NVO', shares: 0, market_value: 0, signal_type: 'EXIT', pct_of_portfolio: 0, has_call_options: false, notes: 'Full exit, same GLP-1 thesis exhaustion' },
  { ticker: 'CRWD', shares: 0, market_value: 0, signal_type: 'EXIT', pct_of_portfolio: 0, has_call_options: false, notes: 'Full exit, +388% gain realized, avg buy ~$100.54' },
];

// ═══════════════════════════════════════════
// NEW INVESTORS (PARTIAL DATA — from cross-investor consensus notes, not full 13F reports)
// ═══════════════════════════════════════════

const MARKS_HOLDINGS = [
  { ticker: 'SMH', shares: null, market_value: null, signal_type: 'REDUCE', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA — Bearish on semiconductors per TLI cross-investor analysis' },
  { ticker: 'ORCL', shares: null, market_value: null, signal_type: 'REDUCE', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA — Bearish per TLI' },
  { ticker: 'SPY', shares: null, market_value: null, signal_type: 'REDUCE', pct_of_portfolio: null, has_call_options: true, notes: 'PARTIAL DATA — SPY puts, late cycle positioning. Bullish sectors: Energy 22%, Transport 17%, Metals/Mining 13%, Telecom 11%, Healthcare 7%. Zero Mag 7 exposure.' },
];

const PTJ_HOLDINGS = [
  { ticker: 'NVDA', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA — equity position, also has NVDA puts for hedging' },
  { ticker: 'MSFT', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA' },
  { ticker: 'GOOGL', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA' },
  { ticker: 'AMD', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA' },
  { ticker: 'SPY', shares: null, market_value: null, signal_type: 'REDUCE', pct_of_portfolio: null, has_call_options: true, notes: 'PARTIAL DATA — SPY puts, bearish hedge. Said last 12 months of bull market = most profitable but most dangerous.' },
  { ticker: 'AAPL', shares: null, market_value: null, signal_type: 'REDUCE', pct_of_portfolio: null, has_call_options: true, notes: 'PARTIAL DATA — AAPL puts' },
  { ticker: 'IVV', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA — bullish financials' },
];

const LAFFONT_HOLDINGS = [
  { ticker: 'AMAT', shares: null, market_value: null, signal_type: 'ADD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA — rotating INTO, >50% discount to sector peers' },
  { ticker: 'NTRA', shares: null, market_value: null, signal_type: 'ADD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA — rotating INTO' },
  { ticker: 'NFLX', shares: null, market_value: null, signal_type: 'ADD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA — rotating INTO' },
  { ticker: 'DASH', shares: null, market_value: null, signal_type: 'ADD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA — rotating INTO' },
  { ticker: 'SPOT', shares: null, market_value: null, signal_type: 'ADD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA — rotating INTO' },
  { ticker: 'MSFT', shares: null, market_value: null, signal_type: 'ADD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA — rotating INTO' },
  { ticker: 'TSM', shares: null, market_value: null, signal_type: 'ADD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA — rotating INTO. Key rule: revenue growth + FCF positive + moat (all three required). INTUIT exit = growth decelerated from 30% to 12%. 219% 3yr return.' },
];

const COHEN_HOLDINGS = [
  { ticker: 'SPY', shares: null, market_value: 3500000000, signal_type: 'HOLD', pct_of_portfolio: null, has_call_options: true, notes: 'PARTIAL DATA — $3.5B in SPY puts, largest position, bearish hedge' },
  { ticker: 'QQQ', shares: null, market_value: 1600000000, signal_type: 'HOLD', pct_of_portfolio: null, has_call_options: true, notes: 'PARTIAL DATA — $1.6B in QQQ puts' },
  { ticker: 'NVDA', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA — bullish equity position' },
  { ticker: 'MSFT', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA' },
  { ticker: 'META', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA' },
  { ticker: 'ASML', shares: null, market_value: null, signal_type: 'HOLD', pct_of_portfolio: null, has_call_options: false, notes: 'PARTIAL DATA — bullish. $59.8B portfolio, 1356 instruments. SNOW exit lesson: 20-30% revenue growth but FCF negative + P/E 170x = VALUE TRAP. FCF positive is NON-NEGOTIABLE.' },
];

// ═══════════════════════════════════════════
// SEED LOGIC
// ═══════════════════════════════════════════

async function seedInvestor(cik, holdings, quarter = QUARTER) {
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

  // Separate active holdings from exits
  const activeHoldings = holdings.filter(h => h.signal_type !== 'EXIT');
  const exits = holdings.filter(h => h.signal_type === 'EXIT');

  console.log(`\n  Seeding ${investor.name} (${activeHoldings.length} holdings, ${exits.length} exits, quarter ${quarter})...`);

  // Calculate total portfolio value from non-null market values
  const totalValue = activeHoldings.reduce((sum, h) => sum + (h.market_value || 0), 0);

  // Build holdings rows (active positions only — exits don't get holdings rows)
  const holdingsRows = activeHoldings
    .sort((a, b) => (b.market_value || 0) - (a.market_value || 0))
    .map((h, idx) => ({
      investor_id: investor.id,
      quarter: quarter,
      ticker: h.ticker,
      shares: h.shares || 0,
      market_value: h.market_value || 0,
      pct_of_portfolio: h.pct_of_portfolio || null,
      portfolio_rank: idx + 1,
      has_call_options: h.has_call_options || false,
      has_put_options: h.has_put_options || false,
    }));

  // Upsert holdings
  if (holdingsRows.length > 0) {
    const { error: upsertErr } = await supabase
      .from('investor_holdings')
      .upsert(holdingsRows, { onConflict: 'investor_id,quarter,ticker' });

    if (upsertErr) {
      console.error(`  Holdings upsert error for ${investor.name}:`, upsertErr.message);
      return 0;
    }
  }

  // Update portfolio value on investor
  if (totalValue > 0) {
    await supabase
      .from('super_investors')
      .update({ portfolio_value_latest: totalValue })
      .eq('id', investor.id);
  }

  // Build signals using the pre-specified signal_type from verified data
  const signals = holdings.map(h => {
    const signalType = h.signal_type || 'HOLD';

    // Determine conviction level
    let conviction = 'LOW';
    if (h.has_call_options && (signalType === 'NEW_BUY' || signalType === 'ADD')) conviction = 'EXTREME';
    else if (signalType === 'NEW_BUY' && (h.market_value || 0) > 1e9) conviction = 'EXTREME';
    else if (signalType === 'NEW_BUY' && (h.market_value || 0) > 500e6) conviction = 'HIGH';
    else if (signalType === 'NEW_BUY') conviction = 'MODERATE';
    else if (signalType === 'ADD' && (h.pct_of_portfolio || 0) > 5) conviction = 'HIGH';
    else if (signalType === 'ADD') conviction = 'MODERATE';
    else if (signalType === 'EXIT') conviction = 'HIGH';
    else if (signalType === 'REDUCE') conviction = 'MODERATE';

    return {
      investor_id: investor.id,
      ticker: h.ticker,
      quarter: quarter,
      signal_type: signalType,
      conviction_level: conviction,
      notes: h.notes || null,
    };
  });

  // Upsert signals
  if (signals.length > 0) {
    const { error: sigErr } = await supabase
      .from('investor_signals')
      .upsert(signals, { onConflict: 'investor_id,quarter,ticker' });
    if (sigErr) console.error(`  Signals upsert error:`, sigErr.message);
  }

  const newBuys = signals.filter(s => s.signal_type === 'NEW_BUY').length;
  const exitCount = signals.filter(s => s.signal_type === 'EXIT').length;
  const adds = signals.filter(s => s.signal_type === 'ADD').length;
  const reduces = signals.filter(s => s.signal_type === 'REDUCE').length;
  console.log(`  ${investor.name}: ${holdingsRows.length} holdings, ${signals.length} signals (${newBuys} new, ${adds} adds, ${reduces} reduces, ${exitCount} exits)`);
  return holdingsRows.length;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('Seeding 13F Data (8 Super Investors)');
  console.log('═══════════════════════════════════════════');

  let total = 0;

  // Berkshire Hathaway (Greg Abel) — Q4 2025
  total += await seedInvestor('0001067983', BERKSHIRE_HOLDINGS);

  // Appaloosa (David Tepper) — Q4 2025
  total += await seedInvestor('0001656456', TEPPER_HOLDINGS);

  // Duquesne (Stanley Druckenmiller) — Q4 2025
  total += await seedInvestor('0001536411', DRUCKENMILLER_HOLDINGS);

  // Tiger Global (Chase Coleman) — Q3 2025
  total += await seedInvestor('0001167483', COLEMAN_HOLDINGS, '2025Q3');

  // Oaktree Capital (Howard Marks) — Q4 2025 PARTIAL
  total += await seedInvestor('0001545660', MARKS_HOLDINGS);

  // Tudor Investment (Paul Tudor Jones) — Q4 2025 PARTIAL
  total += await seedInvestor('0001067839', PTJ_HOLDINGS);

  // Coatue Management (Philippe Laffont) — Q4 2025 PARTIAL
  total += await seedInvestor('0001535392', LAFFONT_HOLDINGS);

  // Point72 (Steven Cohen) — Q3 2025 PARTIAL
  total += await seedInvestor('0001603466', COHEN_HOLDINGS, '2025Q3');

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
