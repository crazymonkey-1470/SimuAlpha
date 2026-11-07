import { supabase } from '../supabase';
import { goBack, useLoad } from '../lib';
import { BackIcon } from '../components/Icons';
import type { ItemCard, ResearchRequest } from '../types';
import ItemCardView from '../components/ItemCard';
import { RESEARCH_SELECT, ResearchCard } from '../components/Research';

export default function ItemPage({ id }: { id: string }) {
  const res = useLoad(() => supabase.from('item_cards').select('*').eq('id', id).maybeSingle(), [id]);
  const research = useLoad(
    () => supabase.from('research_requests').select(RESEARCH_SELECT).eq('item_id', id).order('created_at'),
    [id],
  );
  const reload = () => {
    res.reload();
    research.reload();
  };

  if (res.error) return <p className="error">{res.error}</p>;
  if (res.loading && !res.data) return <p className="muted">Loading…</p>;
  if (!res.data) return <p className="empty">That item doesn’t exist (or was deleted).</p>;
  const requests = (research.data ?? []) as ResearchRequest[];

  return (
    <>
      <button className="link back" onClick={goBack}>
        <BackIcon size={16} />
        Back
      </button>
      <ItemCardView item={res.data as ItemCard} onChange={reload} openComments />
      {requests.length > 0 && (
        <>
          <h2>
            <span>
              Grok <em>research</em>
            </span>{' '}
            <span className="count">{requests.length}</span>
          </h2>
          <div className="list">
            {requests.map((r) => (
              <ResearchCard key={r.id} r={r} onChange={reload} showItem={false} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
