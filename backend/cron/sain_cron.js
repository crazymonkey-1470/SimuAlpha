/**
 * SAIN Cron Jobs — Sprint 9A
 *
 * Schedules:
 *   Every 6 hours:       Scan X accounts (all categories)
 *   Every 12 hours:      Scrape politician trades from QuiverQuant
 *   Every 12 hours +30m: Recompute all SAIN consensus scores
 */

const cron = require('node-cron');
const log = require('../services/logger').child({ module: 'sain_cron' });
const skills = require('../skills');
const { computeAllConsensus } = require('../services/sain_consensus');

// Every 6 hours: scan X accounts (AI models + politicians + market)
cron.schedule('0 */6 * * *', async () => {
  log.info('Starting social scan');
  try {
    const social = await skills.invoke('scan_social', { category: 'ALL' });
    log.info({ signalsFound: social.signals_found, sourcesScanned: social.sources_scanned }, 'Social scan complete');
  } catch (err) {
    log.error({ err }, 'Social scan error');
  }
});

// Every 12 hours: scrape politician trades from QuiverQuant API
cron.schedule('0 */12 * * *', async () => {
  log.info('Starting politician scan');
  try {
    const pol = await skills.invoke('scan_politicians', {});
    log.info({ tradesFound: pol.trades_found, committeeMatches: pol.committee_matches }, 'Politician scan complete');
  } catch (err) {
    log.error({ err }, 'Politician scan error');
  }
});

// Every 12 hours (offset by 30 min): recompute all consensus
cron.schedule('30 */12 * * *', async () => {
  log.info('Computing consensus');
  try {
    const results = await computeAllConsensus();
    const fsc = results.filter(r => r.is_full_stack_consensus);
    log.info({ tickers: results.length, fullStack: fsc.length }, 'Consensus computed');
  } catch (err) {
    log.error({ err }, 'Consensus error');
  }
});

module.exports = {};
