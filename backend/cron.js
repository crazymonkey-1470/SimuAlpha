const cron = require('node-cron');
const { fetchUniverse } = require('./pipeline/stage1_universe');
const { runPrescreen } = require('./pipeline/stage2_prescreen');
const { runDeepScore } = require('./pipeline/stage3_deepscore');
const { runWaveCount } = require('./pipeline/stage4_wavecount');
const { generateWeeklyBrief } = require('./services/claude_interpreter');
const { batchComputeValuations } = require('./services/valuation');
const { updateOutcomes } = require('./services/signalTracker');
const { invoke: invokeSkill } = require('./skills');
const supabase = require('./services/supabase');

/**
 * Run the full pipeline: Stage 1 → 2 → 3 → 4 sequentially.
 */
let pipelineRunning = false;

async function runFullPipeline() {
  if (pipelineRunning) {
    console.log('[Pipeline] Already running, skipping duplicate trigger');
    return;
  }
  pipelineRunning = true;

  console.log('\n════════════════════════════════════════');
  console.log('[Pipeline] Starting full pipeline run...');
  console.log('════════════════════════════════════════');

  try {
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

    // Post-Stage-3: Batch valuation recompute + signal outcome tracking
    try {
      console.log('\n[Pipeline] Running batch valuations...');
      const valResult = await batchComputeValuations();
      console.log(`[Pipeline] Valuations: ${valResult.computed} computed, ${valResult.failed} failed`);
    } catch (err) {
      console.error('[Pipeline] Batch valuations failed:', err.message);
    }

    try {
      console.log('[Pipeline] Updating signal outcomes...');
      await updateOutcomes();
    } catch (err) {
      console.error('[Pipeline] Signal outcomes update failed:', err.message);
    }

    try {
      await runWaveCount();
    } catch (err) {
      console.error('[Pipeline] Stage 4 failed:', err.message);
    }

    console.log('\n[Pipeline] Full pipeline complete.\n');
  } finally {
    pipelineRunning = false;
  }
}

/**
 * Start all cron schedules.
 *
 * TLI runs 2x/week:
 *   Sunday 6am ET   — Full scan before the trading week
 *   Wednesday 6am ET — Midweek check for changes
 *   Sunday 8am ET   — Weekly brief (after Sunday pipeline)
 */
function startCron() {
  // Full pipeline — Sunday 6am ET
  cron.schedule('0 6 * * 0', () => {
    console.log('[Cron] Sunday scan — full pipeline');
    runFullPipeline().catch((err) => console.error('[Cron] Sunday pipeline error:', err.message));
  });

  // Full pipeline — Wednesday 6am ET
  cron.schedule('0 6 * * 3', () => {
    console.log('[Cron] Wednesday midweek check — full pipeline');
    runFullPipeline().catch((err) => console.error('[Cron] Wednesday pipeline error:', err.message));
  });

  // Sprint 10C — Daily outcome tracking at 4am ET
  // Checks every signal for 3/6/12/24-month milestones and records realized returns
  // into signal_outcomes so the agentic learning loop has fresh performance data.
  cron.schedule('0 4 * * *', async () => {
    console.log('[Cron] Daily signal outcome tracking — 4am');
    try {
      await updateOutcomes();
      console.log('[Cron] Signal outcomes refreshed');
    } catch (err) {
      console.error('[Cron] Outcome tracking failed:', err.message);
    }
  });

  // Agent self-improvement analysis — Sunday 10am ET
  // Analyzes knowledge base, scoring outcomes, and errors to suggest improvements.
  cron.schedule('0 10 * * 0', async () => {
    console.log('[Cron] Running agent self-improvement analysis...');
    try {
      const result = await invokeSkill('self_improve', {});
      console.log(`[Cron] Self-improvement: generated ${result.suggestions_generated} suggestions`);
    } catch (err) {
      console.error('[Cron] Self-improvement analysis failed:', err.message);
    }
  });

  // Weekly brief — Sunday 8am ET (after Sunday pipeline completes)
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
  console.log('  Full Pipeline:   Sunday 6am ET + Wednesday 6am ET');
  console.log('  Outcome Track:   Daily 4am ET');
  console.log('  Self-Improve:    Sunday 10am ET');
  console.log('  Weekly Brief:    Sunday 8am ET');
}

module.exports = { runFullPipeline, startCron, runDeepScore, runWaveCount };
