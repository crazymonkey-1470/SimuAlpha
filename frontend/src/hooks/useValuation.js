import { useState, useEffect } from 'react';
import supabase from '../supabaseClient';

export function useValuation(ticker) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    async function fetchData() {
      setLoading(true);
      const { data } = await supabase
        .from('stock_valuations')
        .select('*')
        .eq('ticker', ticker.toUpperCase())
        .order('computed_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      setData(data || null);
      setLoading(false);
    }
    fetchData();
  }, [ticker]);

  return { data, loading };
}
