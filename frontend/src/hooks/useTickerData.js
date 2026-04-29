import { useEffect, useState } from 'react';
import supabase from '../supabaseClient';

// Short, marketing-friendly labels for the signal canon. Maps SimuAlpha's
// internal signal strings to a 1–8 char tag we can fit in a ticker cell.
const SIGNAL_META = {
  'LOAD THE BOAT':              { tag: 'LOAD',    tone: 'green' },
  'ACCUMULATE':                 { tag: 'ACC',     tone: 'amber' },
  'WATCH':                      { tag: 'WATCH',   tone: 'dim'   },
  'TRIM':                       { tag: 'TRIM',    tone: 'amber' },
  'VALUE_TRAP':                 { tag: 'TRAP',    tone: 'red'   },
  'FUNDAMENTAL_DETERIORATION':  { tag: 'BROKEN',  tone: 'red'   },
  'GENERATIONAL_BUY':           { tag: 'GEN BUY', tone: 'gold'  },
  'WAVE_C_BOTTOM':              { tag: 'WAVE C',  tone: 'green' },
  'WAVE_2_BOTTOM':              { tag: 'WAVE 2',  tone: 'green' },
  'WAVE_4_BOTTOM':              { tag: 'WAVE 4',  tone: 'amber' },
  'WAVE_3_IN_PROGRESS':         { tag: 'WAIT',    tone: 'red'   },
  'WAVE_5_IN_PROGRESS':         { tag: 'WAVE 5',  tone: 'red'   },
  'WAVE_3_TARGET_HIT':          { tag: 'TRIM 50', tone: 'amber' },
  'WAVE_5_TARGET_HIT':          { tag: 'PROFITS', tone: 'amber' },
};

function decorate(row) {
  const sig = (row.signal || '').toString().trim();
  // Try exact match, then upper-case fallback (some pipelines store mixed casing)
  const meta =
    SIGNAL_META[sig] || SIGNAL_META[sig.toUpperCase()] || null;
  return {
    ticker: row.ticker,
    price: row.current_price,
    signal: sig,
    tag:  meta?.tag  ?? '—',
    tone: meta?.tone ?? 'dim',
    score: row.total_score ?? null,
  };
}

const REFRESH_MS = 5 * 60 * 1000;

export function useTickerData(limit = 30) {
  const [tickers, setTickers] = useState([]);
  const [totalCount, setTotalCount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [rowsRes, countRes] = await Promise.all([
          supabase
            .from('screener_results')
            .select('ticker, current_price, signal, total_score')
            .not('current_price', 'is', null)
            .order('total_score', { ascending: false, nullsFirst: false })
            .limit(limit),
          supabase
            .from('screener_results')
            .select('ticker', { count: 'exact', head: true }),
        ]);

        if (cancelled) return;

        if (!rowsRes.error && rowsRes.data?.length) {
          setTickers(rowsRes.data.map(decorate));
        }
        if (!countRes.error && typeof countRes.count === 'number') {
          setTotalCount(countRes.count);
        }
      } catch {
        // Network / missing env / RLS — caller will use fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [limit]);

  return { tickers, totalCount, loading };
}
