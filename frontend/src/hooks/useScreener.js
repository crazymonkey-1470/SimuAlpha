import { useState, useEffect } from 'react';
import supabase from '../supabaseClient';

export function useScreenerResults(filters = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      let query = supabase
        .from('screener_results')
        .select('*')
        .order('total_score', { ascending: false });

      if (filters.signal) {
        query = query.eq('signal', filters.signal);
      }
      if (filters.entry_zone) {
        query = query.eq('entry_zone', true);
      }

      const { data, error } = await query;
      if (error) setError(error);
      else setData(data || []);
      setLoading(false);
    }
    fetchData();
  }, [filters.signal, filters.entry_zone]);

  return { data, loading, error };
}

export function useScanHistory() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data } = await supabase
        .from('scan_history')
        .select('*')
        .order('scanned_at', { ascending: false })
        .limit(10);
      setData(data || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  return { data, loading };
}

export function useSignalAlerts() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data } = await supabase
        .from('signal_alerts')
        .select('*')
        .order('fired_at', { ascending: false })
        .limit(100);
      setData(data || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  return { data, loading };
}

export function useWatchlist() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchWatchlist() {
    try {
      const res = await fetch('/api/watchlist');
      const json = await res.json();
      setData(json.watchlist || []);
    } catch (err) {
      console.error('Failed to fetch watchlist:', err);
    }
    setLoading(false);
  }

  useEffect(() => { fetchWatchlist(); }, []);

  async function addTicker(ticker, notes = '') {
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker.toUpperCase(), notes }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error('Failed to add to watchlist:', err.error);
        return false;
      }
      await fetchWatchlist();
      return true;
    } catch (err) {
      console.error('Failed to add to watchlist:', err);
      return false;
    }
  }

  async function removeTicker(id) {
    try {
      await fetch(`/api/watchlist/${id}`, { method: 'DELETE' });
      await fetchWatchlist();
      return true;
    } catch (err) {
      console.error('Failed to remove from watchlist:', err);
      return false;
    }
  }

  async function updateNotes(id, notes) {
    try {
      await fetch(`/api/watchlist/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      await fetchWatchlist();
    } catch (err) {
      console.error('Failed to update notes:', err);
    }
  }

  return { data, loading, addTicker, removeTicker, updateNotes, refetch: fetchWatchlist };
}

export function useConfluenceZones() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data } = await supabase
        .from('screener_results')
        .select('*')
        .eq('confluence_zone', true)
        .order('total_score', { ascending: false });
      setData(data || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  return { data, loading };
}

export function useExitSignals(showAll = false) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    let query = supabase
      .from('exit_signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!showAll) {
      query = query.eq('acknowledged', false);
    }
    const { data } = await query;
    setData(data || []);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, [showAll]);

  async function acknowledge(id) {
    await supabase
      .from('exit_signals')
      .update({ acknowledged: true })
      .eq('id', id);
    fetchData();
  }

  async function acknowledgeAll() {
    const ids = data.map(d => d.id);
    if (ids.length === 0) return;
    await supabase
      .from('exit_signals')
      .update({ acknowledged: true })
      .in('id', ids);
    fetchData();
  }

  // Sort by severity: HIGH first, then MEDIUM, then LOW
  const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const sorted = [...data].sort((a, b) =>
    (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  );

  return { data: sorted, loading, acknowledge, acknowledgeAll, refetch: fetchData };
}

export function useGenerationalBuys() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data } = await supabase
        .from('screener_results')
        .select('*')
        .eq('generational_buy', true)
        .order('total_score', { ascending: false });
      setData(data || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  return { data, loading };
}

export function useTickerDetail(symbol) {
  const [result, setResult] = useState(null);
  const [waveCount, setWaveCount] = useState(null);
  const [backtest, setBacktest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    async function fetchData() {
      setLoading(true);
      const [r1, r2, r3] = await Promise.all([
        supabase.from('screener_results').select('*').eq('ticker', symbol).maybeSingle(),
        supabase.from('wave_counts').select('*').eq('ticker', symbol).order('confidence_score', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('backtest_summary').select('*').eq('ticker', symbol).maybeSingle()
      ]);
      setResult(r1.data || null);
      setWaveCount(r2.data || null);
      setBacktest(r3.data || null);
      setLoading(false);
    }
    fetchData();
  }, [symbol]);

  return { result, waveCount, backtest, loading };
}

export function useLastPipelineRun() {
  const [lastRun, setLastRun] = useState(null);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('screener_results')
        .select('last_updated')
        .order('last_updated', { ascending: false })
        .limit(1);
      if (data?.[0]?.last_updated) setLastRun(data[0].last_updated);
    }
    fetch();
  }, []);

  return lastRun;
}
