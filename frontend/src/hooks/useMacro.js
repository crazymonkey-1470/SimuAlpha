import { useState, useEffect } from 'react';
import supabase from '../supabaseClient';

export function useMacroContext() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data } = await supabase
        .from('macro_context')
        .select('*')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      setData(data || null);
      setLoading(false);
    }
    fetchData();
  }, []);

  return { data, loading };
}

export function useMacroHistory(limit = 30) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data } = await supabase
        .from('macro_context')
        .select('*')
        .order('date', { ascending: false })
        .limit(limit);
      setData(data || []);
      setLoading(false);
    }
    fetchData();
  }, [limit]);

  return { data, loading };
}
