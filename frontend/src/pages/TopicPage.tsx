import { useState } from 'react';
import { supabase } from '../supabase';
import { href, useApp, useLoad } from '../lib';
import type { ItemCard, ItemStatus } from '../types';
import ItemList, { byPriority } from '../components/ItemList';

const FILTERS: { key: string; label: string; statuses: ItemStatus[] | null }[] = [
  { key: 'active', label: 'Inbox + this week', statuses: ['inbox', 'this_week'] },
  { key: 'used', label: 'Used', statuses: ['used'] },
  { key: 'archived', label: 'Archived', statuses: ['archived'] },
  { key: 'all', label: 'All', statuses: null },
];

export default function TopicPage({ slug }: { slug: string }) {
  const { topics } = useApp();
  const topic = topics.find((t) => t.slug === slug);
  const [filter, setFilter] = useState('active');
  const statuses = FILTERS.find((f) => f.key === filter)!.statuses;

  const res = useLoad(() => {
    let q = supabase.from('item_cards').select('*').contains('topics', [slug]);
    if (statuses) q = q.in('status', statuses);
    return q.order('created_at', { ascending: false }).limit(200);
  }, [slug, filter]);
  const items = res.data ? [...(res.data as ItemCard[])].sort(byPriority) : null;

  return (
    <>
      <div className="page-head">
        <h1>{topic?.name ?? slug}</h1>
        <a className="button" href={href('add', slug)}>
          + Add
        </a>
      </div>
      {topic?.description && <p className="hint">{topic.description}</p>}
      <div className="segmented" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={f.key === filter} className={f.key === filter ? 'on' : ''} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      <ItemList items={items} loading={res.loading} error={res.error} onChange={res.reload} empty="Nothing here yet." />
    </>
  );
}
