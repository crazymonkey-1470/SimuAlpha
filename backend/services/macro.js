const supabase = require('./supabase');

/**
 * Macro Context Engine — Sprint 6B
 * Computes market risk level from macro indicators.
 */

function computeMarketRiskLevel(ctx) {
  let score = 0;

  // S&P 500 valuation
  if (ctx.sp500_pe > 28) score += 2;
  else if (ctx.sp500_pe > 25) score += 1;

  // Dollar stress
  if (ctx.dxy_index > 105) score += 2;
  else if (ctx.dxy_index > 100) score += 1;
  if (ctx.eur_usd_basis != null && ctx.eur_usd_basis < -2) score += 1;

  // Carry trade
  if (ctx.carry_spread != null && ctx.carry_spread < 2) score += 1;
  if (ctx.jpy_near_intervention) score += 2;

  // Geopolitical
  if (ctx.iran_war_active) score += 1;

  // Super investor consensus
  if (ctx.investors_defensive_count >= 5) score += 2;
  else if (ctx.investors_defensive_count >= 3) score += 1;
  if (ctx.spy_puts_count >= 3) score += 1;
  if (ctx.berkshire_cash_equity_ratio > 1.0) score += 1;

  // VIX
  if (ctx.vix > 30) score += 2;
  else if (ctx.vix > 20) score += 1;

  ctx.late_cycle_score = score;

  if (score >= 8) ctx.market_risk_level = 'RED';
  else if (score >= 5) ctx.market_risk_level = 'ORANGE';
  else if (score >= 3) ctx.market_risk_level = 'YELLOW';
  else ctx.market_risk_level = 'GREEN';

  // S&P P/E vs 140-year average (17x)
  if (ctx.sp500_pe != null) {
    ctx.sp500_pe_vs_140yr_avg = Math.round((ctx.sp500_pe / 17) * 10) / 10;
  }

  // Carry trade risk
  if (ctx.carry_spread != null && ctx.carry_spread < 1.5 && ctx.jpy_near_intervention) {
    ctx.carry_trade_risk = 'HIGH';
  } else if (ctx.carry_spread != null && ctx.carry_spread < 2.5) {
    ctx.carry_trade_risk = 'MODERATE';
  } else {
    ctx.carry_trade_risk = 'LOW';
  }

  // Compute carry spread from rates if not provided
  if (ctx.carry_spread == null && ctx.fed_rate != null && ctx.boj_rate != null) {
    ctx.carry_spread = Math.round((ctx.fed_rate - ctx.boj_rate) * 100) / 100;
  }

  // Geopolitical risk level
  if (!ctx.geopolitical_risk_level) {
    if (ctx.iran_war_active && ctx.vix > 25) ctx.geopolitical_risk_level = 'HIGH';
    else if (ctx.iran_war_active) ctx.geopolitical_risk_level = 'ELEVATED';
    else if (ctx.vix > 20) ctx.geopolitical_risk_level = 'MODERATE';
    else ctx.geopolitical_risk_level = 'LOW';
  }

  return ctx;
}

async function getLatestMacroContext() {
  const { data, error } = await supabase
    .from('macro_context')
    .select('*')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[Macro] Failed to fetch context:', error.message);
    return null;
  }
  return data;
}

async function getMacroContextHistory(limit = 30) {
  const { data, error } = await supabase
    .from('macro_context')
    .select('*')
    .order('date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Macro] Failed to fetch history:', error.message);
    return [];
  }
  return data || [];
}

async function upsertMacroContext(input) {
  // Compute carry spread
  if (input.carry_spread == null && input.fed_rate != null && input.boj_rate != null) {
    input.carry_spread = Math.round((input.fed_rate - input.boj_rate) * 100) / 100;
  }

  // JPY intervention flag
  if (input.jpy_near_intervention == null && input.jpy_usd != null) {
    input.jpy_near_intervention = input.jpy_usd > 158;
  }

  // Compute risk levels
  const ctx = computeMarketRiskLevel(input);

  const { data, error } = await supabase
    .from('macro_context')
    .upsert(ctx, { onConflict: 'date' })
    .select()
    .maybeSingle();

  if (error) {
    console.error('[Macro] Upsert failed:', error.message);
    throw error;
  }

  return data;
}

module.exports = {
  computeMarketRiskLevel,
  getLatestMacroContext,
  getMacroContextHistory,
  upsertMacroContext,
};
