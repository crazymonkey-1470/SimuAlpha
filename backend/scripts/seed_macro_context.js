/**
 * Macro Context Seeder
 *
 * Seeds the macro_context table with current market conditions.
 * Called by seed-all and the daily macro cron job.
 *
 * Data sources: Static defaults that approximate current macro state.
 * In production, these would be fetched from FRED, Yahoo Finance, etc.
 */

const supabase = require('../services/supabase');
const { upsertMacroContext } = require('../services/macro');
const log = require('../services/logger').child({ module: 'seed_macro' });

async function seedMacroContext() {
  const today = new Date().toISOString().split('T')[0];

  // Check if today's macro context already exists
  const { data: existing } = await supabase
    .from('macro_context')
    .select('id')
    .eq('date', today)
    .maybeSingle();

  if (existing) {
    log.info({ date: today }, 'Macro context already seeded for today');
    return { seeded: false, date: today, message: 'Already exists' };
  }

  // Seed with reasonable defaults for current market conditions
  const macroData = {
    date: today,

    // Market cycle
    sp500_pe: 24.5,
    vix: 16.5,

    // Dollar / Liquidity
    dxy_index: 99.8,
    dxy_direction: 'WEAKENING',
    eur_usd_basis: -0.5,

    // Carry trade
    boj_rate: 0.50,
    fed_rate: 4.25,
    jpy_usd: 143.5,

    // Geopolitical
    iran_war_active: false,

    // Super investor positioning
    investors_defensive_count: 2,
    berkshire_cash_equity_ratio: 0.85,
    spy_puts_count: 1,
  };

  const result = await upsertMacroContext(macroData);
  log.info({ date: today, riskLevel: result.market_risk_level, score: result.late_cycle_score }, 'Macro context seeded');

  return {
    seeded: true,
    date: today,
    risk_level: result.market_risk_level,
    late_cycle_score: result.late_cycle_score,
    carry_trade_risk: result.carry_trade_risk,
  };
}

module.exports = seedMacroContext;
