import type { ItemCard } from '../types';
import ItemCardView from './ItemCard';

interface Props {
  items: ItemCard[] | null;
  loading: boolean;
  error: string | null;
  onChange: () => void;
  empty: string;
  episodeId?: string;
}

export default function ItemList({ items, loading, error, onChange, empty, episodeId }: Props) {
  if (error) return <p className="error">{error}</p>;
  if (loading && !items) return <p className="muted">Loading…</p>;
  if (!items?.length) return <p className="empty">{empty}</p>;
  return (
    <div className="list">
      {items.map((item) => (
        <ItemCardView key={item.id} item={item} onChange={onChange} episodeId={episodeId} />
      ))}
    </div>
  );
}

/** "This week" first, then newest. */
export function byPriority(a: ItemCard, b: ItemCard): number {
  const w = (i: ItemCard) => (i.status === 'this_week' ? 0 : 1);
  return w(a) - w(b) || b.created_at.localeCompare(a.created_at);
}
