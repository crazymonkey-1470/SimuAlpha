import { supabase } from '../supabase';
import { useLoad } from '../lib';
import type { ItemCard } from '../types';
import ItemList, { byPriority } from '../components/ItemList';
import SearchBox from '../components/SearchBox';

export default function Search({ q }: { q: string }) {
  // Characters with meaning in PostgREST filter syntax are dropped.
  const term = q.replace(/[,()*%\\:"]/g, ' ').trim();
  const res = useLoad(
    () =>
      supabase
        .from('item_cards')
        .select('*')
        .or(['title', 'summary', 'source', 'guest_name', 'quote'].map((c) => `${c}.ilike.%${term}%`).join(','))
        .order('created_at', { ascending: false })
        .limit(100),
    [term],
  );
  const items = res.data ? [...(res.data as ItemCard[])].sort(byPriority) : null;

  return (
    <>
      <SearchBox initial={q} />
      <h2>
        Results for “{q}” <span className="count">{items?.length ?? ''}</span>
      </h2>
      <ItemList items={items} loading={res.loading} error={res.error} onChange={res.reload} empty="No matches." />
    </>
  );
}
