const cron = require('node-cron');
const log = require('./services/logger').child({ module: 'pipeline' });
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
    log.warn('Pipeline already running, skipping duplicate trigger');
    return;
  }
  pipelineRunning = true;

  log.info('Starting full pipeline run');

  try {
    try {
      await fetchUniverse();
    } catch (err) {
      log.error({ err }, 'Stage 1 failed');
    }

    try {
      await runPrescreen();
    } catch (err) {
      log.error({ err }, 'Stage 2 failed');
    }

    try {
      await runDeepScore();
    } catch (err) {
      log.error({ err }, 'Stage 3 failed');
    }

    // Post-Stage-3: Batch valuation recompute + signal outcome tracking
    try {
      log.info('Running batch valuations');
      const valResult = await batchComputeValuations();
      log.info({ computed: valResult.computed, failed: valResult.failed }, 'Batch valuations complete');
    } catch (err) {
      log.error({ err }, 'Batch valuations failed');
    }

    try {
      log.info('Updating signal outcomes');
      await updateOutcomes();
    } catch (err) {
      log.error({ err }, 'Signal outcomes update failed');
    }

    try {
      await runWaveCount();
    } catch (err) {
      log.error({ err }, 'Stage 4 failed');
    }

    log.info('Full pipeline complete');
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
    log.info('Sunday scan — full pipeline');
    runFullPipeline().catch((err) => log.error({ err }, 'Sunday pipeline error'));
  });

  // Full pipeline — Wednesday 6am ET
  cron.schedule('0 6 * * 3', () => {
    log.info('Wednesday midweek check — full pipeline');
    runFullPipeline().catch((err) => log.error({ err }, 'Wednesday pipeline error'));
  });

  // Sprint 10C — Daily outcome tracking at 4am ET
  // Checks every signal for 3/6/12/24-month milestones and records realized returns
  // into signal_outcomes so the agentic learning loop has fresh performance data.
  cron.schedule('0 4 * * *', async () => {
    log.info('Daily signal outcome tracking — 4am');
    try {
      await updateOutcomes();
      log.info('Signal outcomes refreshed');
    } catch (err) {
      log.error({ err }, 'Outcome tracking failed');
    }
  });

  // Agent self-improvement analysis — Sunday 10am ET
  // Analyzes knowledge base, scoring outcomes, and errors to suggest improvements.
  cron.schedule('0 10 * * 0', async () => {
    log.info('Running agent self-improvement analysis');
    try {
      const result = await invokeSkill('self_improve', {});
      log.info({ suggestionsGenerated: result.suggestions_generated }, 'Self-improvement complete');
    } catch (err) {
      log.error({ err }, 'Self-improvement analysis failed');
    }
  });

  // Weekly brief — Sunday 8am ET (after Sunday pipeline completes)
  cron.schedule('0 8 * * 0', async () => {
    log.info('Generating weekly brief');
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
        log.info('Weekly brief sent via Telegram');
      }
    } catch (err) {
      log.error({ err }, 'Weekly brief failed');
    }
  });

  log.info({
    schedules: {
      fullPipeline: 'Sunday 6am ET + Wednesday 6am ET',
      outcomeTrack: 'Daily 4am ET',
      selfImprove: 'Sunday 10am ET',
      weeklyBrief: 'Sunday 8am ET',
    },
  }, 'Cron schedules active');
}

module.exports = { runFullPipeline, startCron, runDeepScore, runWaveCount };
