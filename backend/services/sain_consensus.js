/**
 * SAIN Consensus Engine — Sprint 9A
 *
 * Computes 4-layer consensus for any ticker with SAIN signals:
 *   Layer 1: Super Investor Score (from consensus_signals)
 *   Layer 2: Politician Score (committee-weighted)
 *   Layer 3: AI Model Score
 *   Layer 4: TLI Score (from screener_results)
 */

const supabase = require('./supabase');

async function computeConsensus(ticker) {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  // LAYER 1: Super Investor Score (from existing consensus_signals table)
  const { data: superData } = await supabase.from('consensus_signals')
    .select('consensus_score')
    .eq('ticker', ticker)
    .order('quarter', { ascending: false })
    .limit(1)
    .single();
  const superScore = superData?.consensus_score || 0;

  // LAYER 2: Politician Score
  const { data: polSignals } = await supabase.from('sain_signals')
    .select('*')
    .eq('ticker', ticker)
    .not('politician_name', 'is', null)
    .gte('signal_date', thirtyDaysAgo);

  let polScore = 0;
  for (const s of (polSignals || [])) {
    const base = s.direction === 'BUY' ? 2 : -2;
    const committeeBonus = s.committee_sector_match ? 3 : 0;
    const amountMult = getAmountMultiplier(s.trade_amount_range);
    polScore += Math.round((base + committeeBonus) * amountMult);
  }

  // LAYER 3: AI Model Score
  const { data: aiSignals } = await supabase.from('sain_signals')
    .select('*')
    .eq('ticker', ticker)
    .not('ai_model_name', 'is', null)
    .is('politician_name', null)
    .is('insider_name', null)
    .gte('signal_date', thirtyDaysAgo);

  let aiScore = 0;
  for (const s of (aiSignals || [])) {
    aiScore += s.direction === 'BUY' ? 2 : (s.direction === 'SELL' ? -2 : 0);
  }

  // LAYER 4: TLI Score
  const { data: tliData } = await supabase.from('screener_results')
    .select('tli_score, signal')
    .eq('ticker', ticker)
    .limit(1)
    .single();

  let tliScore = 0;
  if (tliData?.tli_score >= 75) tliScore = 5;
  else if (tliData?.tli_score >= 60) tliScore = 3;
  else if (tliData?.tli_score >= 40) tliScore = 1;
  else if (tliData) tliScore = -2;

  // COMBINED
  const totalScore = superScore + polScore + aiScore + tliScore;

  const layers = [
    superScore > 0, polScore > 0, aiScore > 0, tliScore > 0,
  ].filter(Boolean).length;

  const isFullStack = layers === 4;

  let direction;
  if (totalScore >= 10) direction = 'STRONG_BUY';
  else if (totalScore >= 5) direction = 'BUY';
  else if (totalScore > -5) direction = 'MIXED';
  else if (totalScore > -10) direction = 'SELL';
  else direction = 'STRONG_SELL';

  const result = {
    ticker,
    computed_date: today,
    super_investor_score: superScore,
    politician_score: polScore,
    ai_model_score: aiScore,
    tli_score: tliScore,
    total_sain_score: totalScore,
    layers_aligned: layers,
    is_full_stack_consensus: isFullStack,
    consensus_direction: direction,
    politician_trades: polSignals || [],
    ai_model_signals: aiSignals || [],
  };

  await supabase.from('sain_consensus')
    .upsert(result, { onConflict: 'ticker,computed_date' });

  return result;
}

function getAmountMultiplier(range) {
  if (!range) return 1;
  const r = range.toUpperCase();
  if (r.includes('$1,000,001') || r.includes('$5,000,001') || r.includes('$25,000,001') || r.includes('$50,000,001')) return 2;
  if (r.includes('$500,001') || r.includes('$250,001') || r.includes('$100,001')) return 1.5;
  return 1;
}

async function computeAllConsensus() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: tickers } = await supabase.from('sain_signals')
    .select('ticker')
    .gte('signal_date', thirtyDaysAgo);

  const unique = [...new Set(tickers?.map(t => t.ticker) || [])];
  const results = [];
  for (const ticker of unique) {
    results.push(await computeConsensus(ticker));
  }
  return results;
}

module.exports = { computeConsensus, computeAllConsensus };
