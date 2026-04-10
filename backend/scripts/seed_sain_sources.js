/**
 * Seed SAIN Sources — Sprint 9A
 *
 * Populates sain_sources with all tracked accounts and websites.
 * Run once: node scripts/seed_sain_sources.js
 */

require('dotenv').config();
const supabase = require('../services/supabase');

const SOURCES = [
  // ===== CATEGORY: AI_MODEL =====
  { name: 'The Grk Portfolio', platform: 'X', handle: '@TheGrkportfolio',
    source_type: 'AI_PORTFOLIO', category: 'AI_MODEL', scrape_method: 'X_API',
    priority: 'HIGH', scrape_frequency_hours: 6 },
  { name: 'Grokvesting', platform: 'X', handle: '@Grokvesting',
    source_type: 'AI_PORTFOLIO', category: 'AI_MODEL', scrape_method: 'X_API',
    priority: 'HIGH', scrape_frequency_hours: 6 },
  { name: 'GPT Portfolio', platform: 'X', handle: '@gaborinvest',
    source_type: 'AI_PORTFOLIO', category: 'AI_MODEL', scrape_method: 'X_API',
    priority: 'MEDIUM', scrape_frequency_hours: 12 },
  { name: 'Autopilot GPT Portfolio', platform: 'WEB',
    url: 'https://marketplace.joinautopilot.com',
    source_type: 'AI_PORTFOLIO', category: 'AI_MODEL', scrape_method: 'WEB_SCRAPE',
    priority: 'HIGH', scrape_frequency_hours: 24 },

  // ===== CATEGORY: POLITICIAN =====
  { name: 'Nancy Pelosi Stock Tracker', platform: 'X', handle: '@PelosiBuys_',
    source_type: 'POLITICIAN_TRACKER', category: 'POLITICIAN', scrape_method: 'X_API',
    priority: 'CRITICAL', scrape_frequency_hours: 6 },
  { name: 'Unusual Whales', platform: 'X', handle: '@unusual_whales',
    source_type: 'POLITICIAN_TRACKER', category: 'POLITICIAN', scrape_method: 'X_API',
    priority: 'CRITICAL', scrape_frequency_hours: 6 },
  { name: 'Capitol Trades', platform: 'X', handle: '@CapitolTrades',
    source_type: 'POLITICIAN_TRACKER', category: 'POLITICIAN', scrape_method: 'X_API',
    priority: 'HIGH', scrape_frequency_hours: 6 },
  { name: 'Quiver Quantitative', platform: 'X', handle: '@QuiverQuant',
    source_type: 'POLITICIAN_TRACKER', category: 'POLITICIAN', scrape_method: 'X_API',
    priority: 'HIGH', scrape_frequency_hours: 6 },
  { name: 'Congress Trading', platform: 'X', handle: '@CongressTrading',
    source_type: 'POLITICIAN_TRACKER', category: 'POLITICIAN', scrape_method: 'X_API',
    priority: 'MEDIUM', scrape_frequency_hours: 12 },
  { name: 'QuiverQuant API', platform: 'API',
    api_url: 'https://api.quiverquant.com/beta/live/congresstrading',
    source_type: 'STOCK_ACT_SOURCE', category: 'POLITICIAN', scrape_method: 'API',
    priority: 'CRITICAL', scrape_frequency_hours: 12 },
  { name: 'Capitol Trades Website', platform: 'WEB',
    url: 'https://www.capitoltrades.com/trades',
    source_type: 'AGGREGATOR', category: 'POLITICIAN', scrape_method: 'WEB_SCRAPE',
    priority: 'HIGH', scrape_frequency_hours: 12 },
  { name: 'House Stock Watcher', platform: 'WEB',
    url: 'https://housestockwatcher.com/',
    source_type: 'AGGREGATOR', category: 'POLITICIAN', scrape_method: 'WEB_SCRAPE',
    priority: 'MEDIUM', scrape_frequency_hours: 24 },
  { name: 'Senate Stock Watcher', platform: 'WEB',
    url: 'https://senatestockwatcher.com/',
    source_type: 'AGGREGATOR', category: 'POLITICIAN', scrape_method: 'WEB_SCRAPE',
    priority: 'MEDIUM', scrape_frequency_hours: 24 },

  // ===== CATEGORY: NOTABLE_INVESTOR =====
  { name: 'ARK Daily Trades (Cathie Wood)', platform: 'X', handle: '@ArkDaily_',
    source_type: 'NOTABLE_INVESTOR', category: 'NOTABLE_INVESTOR', scrape_method: 'X_API',
    priority: 'HIGH', scrape_frequency_hours: 12 },
  { name: 'Michael Burry Tracker', platform: 'X', handle: '@BurryTracker',
    source_type: 'NOTABLE_INVESTOR', category: 'NOTABLE_INVESTOR', scrape_method: 'X_API',
    priority: 'MEDIUM', scrape_frequency_hours: 24 },
  { name: 'Corporate Insider Trades', platform: 'X', handle: '@InsiderTrades_',
    source_type: 'INSIDER_TRADING', category: 'NOTABLE_INVESTOR', scrape_method: 'X_API',
    priority: 'HIGH', scrape_frequency_hours: 12 },
  { name: 'OpenInsider', platform: 'WEB',
    url: 'http://openinsider.com/',
    source_type: 'INSIDER_TRADING', category: 'NOTABLE_INVESTOR', scrape_method: 'WEB_SCRAPE',
    priority: 'HIGH', scrape_frequency_hours: 24 },
  { name: 'Dataroma', platform: 'WEB',
    url: 'https://www.dataroma.com/m/home.php',
    source_type: 'HEDGE_FUND_TRACKER', category: 'NOTABLE_INVESTOR', scrape_method: 'WEB_SCRAPE',
    priority: 'MEDIUM', scrape_frequency_hours: 168 },

  // ===== CATEGORY: MARKET_SIGNAL =====
  { name: 'Walter Bloomberg', platform: 'X', handle: '@DeItaone',
    source_type: 'NEWS_SIGNAL', category: 'MARKET_SIGNAL', scrape_method: 'X_API',
    priority: 'HIGH', scrape_frequency_hours: 6 },
];

async function seed() {
  for (const source of SOURCES) {
    const { error } = await supabase.from('sain_sources').upsert(source, {
      onConflict: 'name',
    });
    if (error) console.error(`Failed to seed ${source.name}:`, error.message);
    else console.log(`Seeded: ${source.name}`);
  }
  console.log(`\nSeeded ${SOURCES.length} SAIN sources.`);
}

seed();
