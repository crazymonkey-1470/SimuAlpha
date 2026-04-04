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
    const { data } = await supabase
      .from('watchlist')
      .select('*, screener_results(*)')
      .order('added_at', { ascending: false });
    setData(data || []);
    setLoading(false);
  }

  useEffect(() => { fetchWatchlist(); }, []);

  async function addTicker(ticker, notes = '') {
    await supabase.from('watchlist').insert({
      ticker: ticker.toUpperCase(),
      notes
    });
    fetchWatchlist();
  }

  async function removeTicker(id) {
    await supabase.from('watchlist').delete().eq('id', id);
    fetchWatchlist();
  }

  return { data, loading, addTicker, removeTicker };
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
        supabase.from('screener_results').select('*').eq('ticker', symbol).single(),
        supabase.from('wave_counts').select('*').eq('ticker', symbol).order('confidence_score', { ascending: false }).limit(1).single(),
        supabase.from('backtest_summary').select('*').eq('ticker', symbol).single()
      ]);
      setResult(r1.data);
      setWaveCount(r2.data);
      setBacktest(r3.data);
      setLoading(false);
    }
    fetchData();
  }, [symbol]);

  return { result, waveCount, backtest, loading };
}
