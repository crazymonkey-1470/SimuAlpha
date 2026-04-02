const cron = require('node-cron');
const { fetchUniverse } = require('./pipeline/stage1_universe');
const { runPrescreen } = require('./pipeline/stage2_prescreen');
const { runDeepScore } = require('./pipeline/stage3_deepscore');

/**
 * Run the full pipeline: Stage 1 → 2 → 3 sequentially.
 */
async function runFullPipeline() {
  console.log('\n════════════════════════════════════════');
  console.log('[Pipeline] Starting full pipeline run...');
  console.log('════════════════════════════════════════');

  try {
    await fetchUniverse();
  } catch (err) {
    console.error('[Pipeline] Stage 1 failed:', err.message);
  }

  try {
    await runPrescreen();
  } catch (err) {
    console.error('[Pipeline] Stage 2 failed:', err.message);
  }

  try {
    await runDeepScore();
  } catch (err) {
    console.error('[Pipeline] Stage 3 failed:', err.message);
  }

  console.log('\n[Pipeline] Full pipeline complete.\n');
}

/**
 * Start all cron schedules.
 */
function startCron() {
  // Stage 1 — Universe: daily at midnight
  cron.schedule('0 0 * * *', () => {
    console.log('[Cron] Triggering Stage 1 — Universe');
    fetchUniverse().catch((err) => console.error('[Cron] Stage 1 error:', err.message));
  });

  // Stage 2 — Pre-screen: daily at 12:30am (after Stage 1)
  cron.schedule('30 0 * * *', () => {
    console.log('[Cron] Triggering Stage 2 — Pre-screen');
    runPrescreen().catch((err) => console.error('[Cron] Stage 2 error:', err.message));
  });

  // Stage 3 — Deep Score: every 6 hours
  cron.schedule('0 */6 * * *', () => {
    console.log('[Cron] Triggering Stage 3 — Deep Score');
    runDeepScore().catch((err) => console.error('[Cron] Stage 3 error:', err.message));
  });

  console.log('[Cron] Schedules active:');
  console.log('  Stage 1 (Universe):   midnight daily');
  console.log('  Stage 2 (Prescreen):  12:30am daily');
  console.log('  Stage 3 (Deep Score): every 6 hours');
}

module.exports = { runFullPipeline, startCron, runDeepScore };
