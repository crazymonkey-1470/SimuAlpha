import { useState, useEffect, useCallback } from 'react';
import supabase from '../supabaseClient';

/**
 * Fetch full-stack consensus stocks (all 4 layers aligned)
 */
export function useFullStackConsensus() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from('sain_consensus').select('*')
        .eq('is_full_stack_consensus', true)
        .order('total_sain_score', { ascending: false });
      setData(data || []);
      setLoading(false);
    }
    fetch();
  }, []);

  return { data, loading };
}

/**
 * Fetch all recent SAIN signals (unified feed)
 */
export function useSAINSignals(limit = 50) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('sain_signals').select('*')
      .order('signal_date', { ascending: false })
      .limit(limit);
    setData(data || []);
    setLoading(false);
  }, [limit]);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, refetch };
}

/**
 * Fetch politician signals only
 */
export function usePoliticianSignals() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from('sain_signals').select('*')
        .not('politician_name', 'is', null)
        .order('signal_date', { ascending: false })
        .limit(50);
      setData(data || []);
      setLoading(false);
    }
    fetch();
  }, []);

  return { data, loading };
}

/**
 * Fetch AI model signals only
 */
export function useAIModelSignals() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from('sain_signals').select('*')
        .not('ai_model_name', 'is', null)
        .is('politician_name', null)
        .order('signal_date', { ascending: false })
        .limit(50);
      setData(data || []);
      setLoading(false);
    }
    fetch();
  }, []);

  return { data, loading };
}

/**
 * Fetch top consensus stocks by SAIN score
 */
export function useTopConsensus(limit = 20) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from('sain_consensus').select('*')
        .order('total_sain_score', { ascending: false })
        .limit(limit);
      setData(data || []);
      setLoading(false);
    }
    fetch();
  }, [limit]);

  return { data, loading };
}

/**
 * Fetch all consensus records for leaderboard (sorted by score)
 */
export function useConsensusLeaderboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from('sain_consensus').select('*')
        .order('total_sain_score', { ascending: false });
      setData(data || []);
      setLoading(false);
    }
    fetch();
  }, []);

  return { data, loading };
}

/**
 * Fetch SAIN consensus for a specific ticker
 */
export function useTickerConsensus(ticker) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) { setLoading(false); return; }
    async function fetch() {
      const { data } = await supabase.from('sain_consensus').select('*')
        .eq('ticker', ticker.toUpperCase())
        .order('computed_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      setData(data || null);
      setLoading(false);
    }
    fetch();
  }, [ticker]);

  return { data, loading };
}

/**
 * Fetch SAIN signals for a specific ticker
 */
export function useTickerSignals(ticker) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) { setLoading(false); return; }
    async function fetch() {
      const { data } = await supabase.from('sain_signals').select('*')
        .eq('ticker', ticker.toUpperCase())
        .order('signal_date', { ascending: false })
        .limit(20);
      setData(data || []);
      setLoading(false);
    }
    fetch();
  }, [ticker]);

  return { data, loading };
}

/**
 * Fetch SAIN network stats (sources + recent signal counts)
 */
export function useSAINStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [sourcesRes, signalsRes, polRes, aiRes, fscRes] = await Promise.all([
        supabase.from('sain_sources').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('sain_signals').select('*', { count: 'exact', head: true }).gte('signal_date', oneDayAgo),
        supabase.from('sain_signals').select('*', { count: 'exact', head: true }).not('politician_name', 'is', null).gte('signal_date', oneDayAgo),
        supabase.from('sain_signals').select('*', { count: 'exact', head: true }).not('ai_model_name', 'is', null).is('politician_name', null).gte('signal_date', oneDayAgo),
        supabase.from('sain_consensus').select('*', { count: 'exact', head: true }).eq('is_full_stack_consensus', true),
      ]);

      // Get last scan time from sain_signals
      const { data: lastSignal } = await supabase.from('sain_signals').select('signal_date')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

      setStats({
        sourcesActive: sourcesRes.count || 0,
        signals24h: signalsRes.count || 0,
        politicians24h: polRes.count || 0,
        aiModels24h: aiRes.count || 0,
        insiders24h: Math.max(0, (signalsRes.count || 0) - (polRes.count || 0) - (aiRes.count || 0)),
        fullStackCount: fscRes.count || 0,
        lastScan: lastSignal?.signal_date || null,
      });
      setLoading(false);
    }
    fetch();
  }, []);

  return { stats, loading };
}

/**
 * Count of new signals in last 24h (for nav badge)
 */
export function useSAINSignalCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    async function fetch() {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase.from('sain_signals')
        .select('*', { count: 'exact', head: true })
        .gte('signal_date', oneDayAgo);
      setCount(count || 0);
    }
    fetch();
  }, []);

  return count;
}
