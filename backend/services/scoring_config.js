/**
 * Scoring Config Service — Sprint 10C
 *
 * Runtime weight lookup for the v3 scorer. Reads from the scoring_config
 * table and caches values in-memory for the duration of a process run.
 * The cache is invalidated by calling reloadConfig() — typically after an
 * admin approves a weight adjustment.
 *
 * Fallback defaults live in DEFAULTS below so the scorer still works
 * if Supabase is unreachable or the table has not been seeded yet.
 */

const supabase = require('./supabase');

// Hardcoded fallback defaults — mirrors migration_sprint10c.sql seed values
const DEFAULTS = {
  // Fundamental layer
  fundamental_revenue_growth: 5,
  fundamental_gross_margin: 5,
  fundamental_fcf: 5,
  fundamental_balance_sheet: 5,
  fundamental_tam: 5,
  fundamental_moat: 5,
  // Confluence layer
  confluence_previous_low: 3,
  confluence_round_number: 2,
  confluence_50ma: 3,
  confluence_200ma: 4,
  confluence_200wma: 5,
  confluence_fib_0382: 3,
  confluence_fib_050: 4,
  confluence_fib_0618: 5,
  confluence_fib_0786: 4,
  confluence_wave1_origin: 5,
  confluence_zone_bonus: 15,
  generational_buy_bonus: 20,
  // SAIN layer
  sain_full_stack: 15,
  sain_three_layer: 8,
  sain_politician_conviction: 5,
  sain_ai_consensus: 4,
  // Risk filter parameters
  downtrend_threshold: 4,
  chase_filter_pct: 20,
  earnings_blackout_days: 14,
  sentiment_boost: 5,
};

let CACHE = null;
let LOADING = null;

/**
 * Load all scoring config values from the database into memory.
 * Silently falls back to DEFAULTS on error so the scorer never blocks.
 */
async function loadConfig() {
  try {
    const { data, error } = await supabase
      .from('scoring_config')
      .select('config_key, config_value');

    if (error) {
      console.warn('[scoring_config] DB read failed, using defaults:', error.message);
      return { ...DEFAULTS };
    }

    const merged = { ...DEFAULTS };
    for (const row of data || []) {
      merged[row.config_key] = Number(row.config_value);
    }
    return merged;
  } catch (err) {
    console.warn('[scoring_config] Load failed, using defaults:', err.message);
    return { ...DEFAULTS };
  }
}

/**
 * Get all config values. Lazy-loads on first call and caches thereafter.
 */
async function getAllConfig() {
  if (CACHE) return CACHE;
  if (LOADING) return LOADING;

  LOADING = loadConfig().then((cfg) => {
    CACHE = cfg;
    LOADING = null;
    return CACHE;
  });
  return LOADING;
}

/**
 * Synchronous cache getter — returns DEFAULTS if cache has not been
 * warmed yet. Used by the hot path of the scorer where an async
 * lookup is impractical.
 */
function getCachedConfig() {
  return CACHE || DEFAULTS;
}

/**
 * Get a single config value by key.
 */
async function getConfig(key) {
  const cfg = await getAllConfig();
  return cfg[key] ?? DEFAULTS[key] ?? null;
}

/**
 * Force a cache reload — call after admin approves a weight change.
 */
async function reloadConfig() {
  CACHE = null;
  LOADING = null;
  return getAllConfig();
}

/**
 * Apply a weight adjustment to the scoring_config table.
 * Only keys present in DEFAULTS (adjustable config) are accepted.
 */
async function applyWeightAdjustment({ config_key, new_value, modified_by }) {
  if (!(config_key in DEFAULTS)) {
    throw new Error(`[scoring_config] "${config_key}" is not an adjustable config key`);
  }

  const { error } = await supabase
    .from('scoring_config')
    .upsert({
      config_key,
      config_value: new_value,
      last_modified: new Date().toISOString(),
      modified_by: modified_by || 'admin',
    }, { onConflict: 'config_key' });

  if (error) {
    throw new Error(`[scoring_config] Upsert failed: ${error.message}`);
  }

  await reloadConfig();
  return { config_key, new_value };
}

module.exports = {
  DEFAULTS,
  loadConfig,
  getAllConfig,
  getCachedConfig,
  getConfig,
  reloadConfig,
  applyWeightAdjustment,
};
