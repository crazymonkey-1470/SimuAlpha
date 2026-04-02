import { Router } from 'express';
import { supabase } from '../utils/supabase.js';

export const resultsRouter = Router();

/**
 * GET /api/results
 * Returns latest cached screener results sorted by total_score desc.
 */
resultsRouter.get('/results', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ success: true, results: [], message: 'Database not configured' });
    }

    const { data, error } = await supabase
      .from('screener_results')
      .select('*')
      .order('total_score', { ascending: false });

    if (error) throw error;

    res.json({ success: true, results: data || [] });
  } catch (err) {
    console.error('[TLI] Results fetch error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch results' });
  }
});
