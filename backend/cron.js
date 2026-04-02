const cron = require('node-cron');
const { fetchUniverse } = require('./pipeline/stage1_universe');
const { runPrescreen } = require('./pipeline/stage2_prescreen');
const { runDeepScore } = require('./pipeline/stage3_deepscore');
const { runWaveCount } = require('./pipeline/stage4_wavecount');
const { generateWeeklyBrief } = require('./services/claude_interpreter');
const supabase = require('./services/supabase');

/**
 * Run the full pipeline: Stage 1 → 2 → 3 → 4 sequentially.
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

  try {
    await runWaveCount();
  } catch (err) {
    console.error('[Pipeline] Stage 4 failed:', err.message);
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

  // Stage 4 — Wave Count: daily at 2am (after Stage 3's midnight run)
  cron.schedule('0 2 * * *', () => {
    console.log('[Cron] Triggering Stage 4 — Wave Count');
    runWaveCount().catch((err) => console.error('[Cron] Stage 4 error:', err.message));
  });

  // Weekly brief — Sunday 8am
  cron.schedule('0 8 * * 0', async () => {
    console.log('[Cron] Generating weekly brief...');
    try {
      const { data: topOpportunities } = await supabase
        .from('screener_results')
        .select('ticker, company_name, total_score, signal, revenue_growth_pct, pct_from_200wma, pct_from_200mma')
        .in('signal', ['LOAD THE BOAT', 'ACCUMULATE'])
        .order('total_score', { ascending: false })
        .limit(10);

      const { data: recentAlerts } = await supabase
        .from('signal_alerts')
        .select('ticker, alert_type, new_signal, score, fired_at, claude_narrative')
        .gte('fired_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('fired_at', { ascending: false });

      const brief = await generateWeeklyBrief(topOpportunities, recentAlerts);

      if (brief && process.env.TELEGRAM_BOT_TOKEN) {
        const message = `\u{1F4CA} <b>WEEKLY BRIEF</b>\n\n${brief}`;
        await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: process.env.TELEGRAM_CHAT_ID,
              text: message,
              parse_mode: 'HTML',
            }),
          }
        );
        console.log('[Cron] Weekly brief sent via Telegram');
      }
    } catch (error) {
      console.error('[Cron] Weekly brief failed:', error.message);
    }
  });

  console.log('[Cron] Schedules active:');
  console.log('  Stage 1 (Universe):    midnight daily');
  console.log('  Stage 2 (Prescreen):   12:30am daily');
  console.log('  Stage 3 (Deep Score):  every 6 hours');
  console.log('  Stage 4 (Wave Count):  2am daily');
  console.log('  Weekly Brief:          Sunday 8am');
}

module.exports = { runFullPipeline, startCron, runDeepScore, runWaveCount };
