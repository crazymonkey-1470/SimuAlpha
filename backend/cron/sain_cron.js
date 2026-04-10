/**
 * SAIN Cron Jobs — Sprint 9A
 *
 * Schedules:
 *   Every 6 hours:       Scan X accounts (all categories)
 *   Every 12 hours:      Scrape politician trades from QuiverQuant
 *   Every 12 hours +30m: Recompute all SAIN consensus scores
 */

const cron = require('node-cron');
const skills = require('../skills');
const { computeAllConsensus } = require('../services/sain_consensus');

// Every 6 hours: scan X accounts (AI models + politicians + market)
cron.schedule('0 */6 * * *', async () => {
  console.log('[SAIN CRON] Starting social scan...');
  try {
    const social = await skills.invoke('scan_social', { category: 'ALL' });
    console.log(`[SAIN CRON] Social scan: ${social.signals_found} signals from ${social.sources_scanned} sources`);
  } catch (err) {
    console.error('[SAIN CRON] Social scan error:', err.message);
  }
});

// Every 12 hours: scrape politician trades from QuiverQuant API
cron.schedule('0 */12 * * *', async () => {
  console.log('[SAIN CRON] Starting politician scan...');
  try {
    const pol = await skills.invoke('scan_politicians', {});
    console.log(`[SAIN CRON] Politician scan: ${pol.trades_found} trades, ${pol.committee_matches} committee matches`);
  } catch (err) {
    console.error('[SAIN CRON] Politician scan error:', err.message);
  }
});

// Every 12 hours (offset by 30 min): recompute all consensus
cron.schedule('30 */12 * * *', async () => {
  console.log('[SAIN CRON] Computing consensus...');
  try {
    const results = await computeAllConsensus();
    const fsc = results.filter(r => r.is_full_stack_consensus);
    console.log(`[SAIN CRON] Consensus computed for ${results.length} tickers. Full Stack: ${fsc.length}`);
  } catch (err) {
    console.error('[SAIN CRON] Consensus error:', err.message);
  }
});

module.exports = {};
