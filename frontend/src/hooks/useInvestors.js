import { useState, useEffect } from 'react';
import supabase from '../supabaseClient';

export function useInvestors() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data } = await supabase
        .from('super_investors')
        .select('*')
        .order('name');
      setData(data || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  return { data, loading };
}

export function useInvestorHoldings(investorId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!investorId) return;
    async function fetchData() {
      setLoading(true);
      const { data } = await supabase
        .from('investor_holdings')
        .select('*')
        .eq('investor_id', investorId)
        .order('portfolio_rank', { ascending: true })
        .limit(100);
      setData(data || []);
      setLoading(false);
    }
    fetchData();
  }, [investorId]);

  return { data, loading };
}

export function useInvestorSignals(investorId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!investorId) return;
    async function fetchData() {
      setLoading(true);
      const { data } = await supabase
        .from('investor_signals')
        .select('*')
        .eq('investor_id', investorId)
        .order('quarter', { ascending: false })
        .limit(200);
      setData(data || []);
      setLoading(false);
    }
    fetchData();
  }, [investorId]);

  return { data, loading };
}

export function useConsensusSummary() {
  const [topBuys, setTopBuys] = useState([]);
  const [topSells, setTopSells] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const [buys, sells] = await Promise.all([
        supabase
          .from('consensus_signals')
          .select('*')
          .gt('consensus_score', 0)
          .order('consensus_score', { ascending: false })
          .limit(10),
        supabase
          .from('consensus_signals')
          .select('*')
          .lt('consensus_score', 0)
          .order('consensus_score', { ascending: true })
          .limit(10),
      ]);
      setTopBuys(buys.data || []);
      setTopSells(sells.data || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  return { topBuys, topSells, loading };
}

export function useConsensusForTicker(ticker) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    async function fetchData() {
      setLoading(true);
      const { data } = await supabase
        .from('consensus_signals')
        .select('*')
        .eq('ticker', ticker.toUpperCase())
        .order('quarter', { ascending: false });
      setData(data || []);
      setLoading(false);
    }
    fetchData();
  }, [ticker]);

  return { data, loading };
}
