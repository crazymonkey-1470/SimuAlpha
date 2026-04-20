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
const { upsertMacroContext, getLatestMacroContext } = require('./services/macro');
const { runWeeklyReport } = require('./cron/weekly_report_cron');

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

  // Daily macro context refresh — 5am ET
  // Seeds today's macro context if it doesn't exist, or refreshes it.
  cron.schedule('0 5 * * *', async () => {
    log.info('Running daily macro context refresh');
    try {
      const today = new Date().toISOString().split('T')[0];
      const existing = await getLatestMacroContext();

      if (existing && existing.date === today) {
        log.info('Macro context already current for today');
        return;
      }

      // Carry forward yesterday's data with today's date
      const base = existing || {};
      const refreshed = {
        date: today,
        sp500_pe: base.sp500_pe || 24.5,
        vix: base.vix || 16.5,
        dxy_index: base.dxy_index || 99.8,
        dxy_direction: base.dxy_direction || 'STABLE',
        eur_usd_basis: base.eur_usd_basis || -0.5,
        boj_rate: base.boj_rate || 0.50,
        fed_rate: base.fed_rate || 4.25,
        jpy_usd: base.jpy_usd || 143.5,
        iran_war_active: base.iran_war_active ?? false,
        investors_defensive_count: base.investors_defensive_count || 2,
        berkshire_cash_equity_ratio: base.berkshire_cash_equity_ratio || 0.85,
        spy_puts_count: base.spy_puts_count || 1,
      };

      const result = await upsertMacroContext(refreshed);
      log.info({ date: today, riskLevel: result.market_risk_level }, 'Macro context refreshed');
    } catch (err) {
      log.error({ err }, 'Macro context refresh failed');
    }
  });

  // Sunday 9am: send weekly digest via Telegram
  cron.schedule('0 9 * * 0', async () => {
    log.info('Sending weekly digest');
    try {
      const { generateWeeklyDigest } = require('./services/email_digest');
      const digest = await generateWeeklyDigest();
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (token && chatId) {
        let text = '\u{1F4CA} SimuAlpha Weekly Digest\n\n';
        for (const s of digest.top_opportunities) {
          text += `${s.ticker} (${s.total_score}) ${s.signal?.replace(/_/g, ' ')}\n`;
        }
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
        });
      }
      log.info('Weekly digest sent');
    } catch (err) {
      log.error({ err }, 'Weekly digest failed');
    }
  });

  // ═══════════════════════════════════════════
  // X (Twitter) Posting Schedule
  // ═══════════════════════════════════════════

  // Daily signal scan — 9am ET (14:00 UTC)
  cron.schedule('0 14 * * *', async () => {
    if (!process.env.X_ACCESS_TOKEN) return;
    log.info('Posting daily signal scan to X');
    try {
      const { postDailySignalScan } = require('./services/x_poster');
      await postDailySignalScan();
    } catch (err) {
      log.error({ err }, 'X daily signal scan post failed');
    }
  });

  // Spotlight post — 12pm ET (17:00 UTC), Mon/Wed/Fri
  cron.schedule('0 17 * * 1,3,5', async () => {
    if (!process.env.X_ACCESS_TOKEN) return;
    log.info('Posting spotlight to X');
    try {
      const { postSpotlight } = require('./services/x_poster');
      await postSpotlight();
    } catch (err) {
      log.error({ err }, 'X spotlight post failed');
    }
  });

  // Market context — Tuesday/Thursday 11am ET (16:00 UTC)
  cron.schedule('0 16 * * 2,4', async () => {
    if (!process.env.X_ACCESS_TOKEN) return;
    log.info('Posting market context to X');
    try {
      const { postMarketContext } = require('./services/x_poster');
      await postMarketContext();
    } catch (err) {
      log.error({ err }, 'X market context post failed');
    }
  });

  // ═══════════════════════════════════════════
  // Weekly Market Report
  // ═══════════════════════════════════════════

  // Wednesday 12:00 EST (17:00 UTC)
  // Analyzes all posts from past week, generates report, sends to Telegram
  cron.schedule('0 17 * * 3', async () => {
    log.info('Weekly report — Wednesday 12pm EST');
    try {
      await runWeeklyReport();
    } catch (err) {
      log.error({ err }, 'Weekly report (Wednesday) failed');
    }
  });

  // Friday 16:00 EST (21:00 UTC)
  // Second report of the week (captures Fri/Sat activity)
  cron.schedule('0 21 * * 5', async () => {
    log.info('Weekly report — Friday 4pm EST');
    try {
      await runWeeklyReport();
    } catch (err) {
      log.error({ err }, 'Weekly report (Friday) failed');
    }
  });

  log.info({
    schedules: {
      fullPipeline: 'Sunday 6am ET + Wednesday 6am ET',
      outcomeTrack: 'Daily 4am ET',
      macroRefresh: 'Daily 5am ET',
      weeklyBrief: 'Sunday 8am ET',
      weeklyDigest: 'Sunday 9am ET',
      selfImprove: 'Sunday 10am ET',
      xDailyScan: 'Daily 9am ET',
      xSpotlight: 'Mon/Wed/Fri 12pm ET',
      xMarketContext: 'Tue/Thu 11am ET',
      weeklyReport: 'Wednesday 12pm EST + Friday 4pm EST',
    },
  }, 'Cron schedules active');
}

module.exports = { runFullPipeline, startCron, runDeepScore, runWaveCount };
