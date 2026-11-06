import { supabase } from '../supabase';
import { useLoad } from '../lib';
import type { ItemCard } from '../types';
import ItemCardView from '../components/ItemCard';

export default function ItemPage({ id }: { id: string }) {
  const res = useLoad(() => supabase.from('item_cards').select('*').eq('id', id).maybeSingle(), [id]);
  if (res.error) return <p className="error">{res.error}</p>;
  if (res.loading && !res.data) return <p className="muted">Loading…</p>;
  if (!res.data) return <p className="empty">That item doesn’t exist (or was deleted).</p>;
  return (
    <>
      <button className="link back" onClick={() => history.back()}>
        ← Back
      </button>
      <ItemCardView item={res.data as ItemCard} onChange={res.reload} openComments />
    </>
  );
}
