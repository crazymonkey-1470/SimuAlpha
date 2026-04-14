/**
 * V1 Stock Routes — Composite endpoints for SimuAlpha agents
 */

const express = require('express');
const router = express.Router();
const supabase = require('../../services/supabase');
const { requireAuth } = require('../../middleware/auth');
const log = require('../../services/logger').child({ module: 'v1/stocks' });

/**
 * GET /api/v1/stocks/:ticker/full
 * Composite payload — everything needed to brief a user in one call.
 */
router.get('/:ticker/full', requireAuth('read', 'agent'), async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();

  try {
    const [
      screenerRes,
      waveRes,
      analysisRes,
      valuationRes,
      consensusRes,
      signalsRes,
      exitRes,
      sainRes,
    ] = await Promise.all([
      supabase.from('screener_results').select('*').eq('ticker', ticker).single(),
      supabase.from('wave_counts').select('*').eq('ticker', ticker).order('last_updated', { ascending: false }).limit(1).single(),
      supabase.from('stock_analysis').select('ticker,signal,composite_score,thesis_text,thesis_json,moat_analysis,earnings_quality,wave_analysis,position_card,rating,margin_of_safety,analyzed_at').eq('ticker', ticker).order('analyzed_at', { ascending: false }).limit(1).single(),
      supabase.from('stock_valuations').select('*').eq('ticker', ticker).order('computed_date', { ascending: false }).limit(1).single(),
      supabase.from('consensus_signals').select('*').eq('ticker', ticker).order('quarter', { ascending: false }).limit(4),
      supabase.from('signal_alerts').select('*').eq('ticker', ticker).order('created_at', { ascending: false }).limit(5),
      supabase.from('exit_signals').select('*').eq('ticker', ticker).eq('is_active', true).order('created_at', { ascending: false }).limit(5),
      supabase.from('sain_consensus').select('*').eq('ticker', ticker).order('computed_date', { ascending: false }).limit(1).single(),
    ]);

    const screener = screenerRes.data || null;
    if (!screener) {
      return res.fail(`${ticker} not found in our universe or hasn't been scored yet.`, 404);
    }

    return res.success({
      ticker,
      company_name: screener.company_name,
      current_price: screener.current_price,
      signal: screener.signal,
      total_score: screener.total_score || screener.tli_score,
      screener,
      wave: waveRes.data || null,
      analysis: analysisRes.data || null,
      valuation: valuationRes.data || null,
      consensus: consensusRes.data || [],
      recent_signals: signalsRes.data || [],
      exit_signals: exitRes.data || [],
      sain_consensus: sainRes.data || null,
      pipeline_last_run: screener.updated_at || null,
    });
  } catch (err) {
    log.error({ err, ticker }, 'getStockFull failed');
    return res.fail(`Failed to fetch data for ${ticker}`, 500, err.message);
  }
});

/**
 * GET /api/v1/stocks/:ticker/wave
 * Wave count + Claude interpretation
 */
router.get('/:ticker/wave', requireAuth('read', 'agent'), async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const force = req.query.force === '1';

  try {
    const { data: wave } = await supabase
      .from('wave_counts')
      .select('*')
      .eq('ticker', ticker)
      .order('last_updated', { ascending: false })
      .limit(1)
      .single();

    if (!wave && !force) {
      return res.fail(`No wave count available for ${ticker} yet.`, 404);
    }

    // If force=1, trigger fresh analysis async
    if (force) {
      const { analyzeStock } = require('../../services/orchestrator');
      analyzeStock(ticker).catch(err => log.error({ err, ticker }, 'Force wave reanalysis failed'));
    }

    return res.success({
      ticker,
      wave_count: wave?.wave_count_json || null,
      interpretation: wave?.claude_interpretation || null,
      last_updated: wave?.last_updated || null,
      refreshing: force,
    });
  } catch (err) {
    log.error({ err, ticker }, 'getWave failed');
    return res.fail(`Failed to fetch wave data for ${ticker}`, 500, err.message);
  }
});

/**
 * GET /api/v1/stocks/:ticker/signal
 * Current signal tier and score summary
 */
router.get('/:ticker/signal', requireAuth('read', 'agent'), async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();

  try {
    const { data: screener } = await supabase
      .from('screener_results')
      .select('ticker, company_name, current_price, signal, total_score, tli_score, fundamental_score, technical_score, price_200wma, price_200mma, ma_50d, updated_at')
      .eq('ticker', ticker)
      .single();

    if (!screener) return res.fail(`${ticker} not found.`, 404);

    const { data: recent } = await supabase
      .from('signal_alerts')
      .select('*')
      .eq('ticker', ticker)
      .order('created_at', { ascending: false })
      .limit(3);

    return res.success({
      ticker,
      company_name: screener.company_name,
      current_price: screener.current_price,
      signal: screener.signal,
      total_score: screener.total_score || screener.tli_score,
      fundamental_score: screener.fundamental_score,
      technical_score: screener.technical_score,
      ma_50: screener.ma_50d,
      ma_200w: screener.price_200wma,
      ma_200m: screener.price_200mma,
      recent_changes: recent || [],
      last_scored: screener.updated_at,
    });
  } catch (err) {
    log.error({ err, ticker }, 'getSignal failed');
    return res.fail(`Failed to fetch signal for ${ticker}`, 500, err.message);
  }
});

module.exports = router;
