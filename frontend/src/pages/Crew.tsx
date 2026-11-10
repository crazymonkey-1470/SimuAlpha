import { useState } from 'react';
import { supabase } from '../supabase';
import { formatTimestamp, freshness, href, roman, useApp, useLoad } from '../lib';
import { ITEM_TYPES, STATUS_LABEL, type CrewStat, type ItemCard } from '../types';

const PERIODS = [
  { days: 7, label: 'This week' },
  { days: 30, label: 'This month' },
  { days: 0, label: 'All time' },
];

/** Who added what, and how it did. */
export default function Crew() {
  const { me } = useApp();
  const [days, setDays] = useState(7);
  const board = useLoad<CrewStat[]>(() => supabase.rpc('crew_board', { days: days || null }), [days]);
  const [open, setOpen] = useState<string | null>(null);
  const rows = board.data ?? [];
  const leader = rows[0]?.added ? rows[0] : null;

  return (
    <div className="narrow crew-page">
      <h1>
        Crew <em>board</em>
      </h1>
      <p className="hint">
        Who’s bringing material to the prep room. <b>Added</b> counts everything put in the prep room, from the Feed’s
        “Discuss this” or the Add tab. <b>Nominated</b> means picked for This week, and <b>on air</b> means used in an
        episode.
      </p>
      <div className="segmented" role="tablist">
        {PERIODS.map((p) => (
          <button key={p.days} role="tab" aria-selected={days === p.days} className={days === p.days ? 'on' : ''} onClick={() => setDays(p.days)}>
            {p.label}
          </button>
        ))}
      </div>
      {board.error && <p className="error">{board.error}</p>}
      {board.loading && !board.data && <p className="muted">Loading…</p>}
      {leader && (
        <p className="crew-leader">
          Most added {PERIODS.find((p) => p.days === days)!.label.toLowerCase()}: <b>{leader.name}</b> ({leader.added})
        </p>
      )}
      <ol className="crew-board">
        {rows.map((r, i) => {
          const key = r.member_id ?? 'grok';
          const isOpen = open === key;
          return (
            <li key={key} className={`card crew-row ${r.member_id === me.id ? 'me' : ''}`}>
              <div className="crew-row-head">
                <span className="crew-rank" aria-hidden="true">
                  {roman(i + 1)}
                </span>
                <div className="crew-who">
                  <b>
                    {r.name}
                    {r.member_id === me.id ? ' (you)' : ''}
                  </b>
                  <span className="muted">
                    {r.last_added ? `last added ${freshness(r.last_added.slice(0, 10))}` : 'nothing added in this period'}
                  </span>
                </div>
                <span className="crew-count">
                  {r.added}
                  <small>added</small>
                </span>
              </div>
              <p className="crew-stats">
                {r.from_feed > 0 && <span>{r.from_feed} from the Feed</span>}
                <span>{r.nominated} nominated</span>
                <span>{r.on_air} on air</span>
                <span>{r.stars_received} ★ received</span>
                <span>{r.comments} comments</span>
                {r.member_id ? <span>{r.stars_given} ★ given</span> : null}
                <span>{r.member_id ? `${r.research} asked of Grok` : `${r.research} research answered`}</span>
              </p>
              {r.added > 0 && (
                <button className="link" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen}>
                  {isOpen ? 'Hide' : 'See what they added'}
                </button>
              )}
              {isOpen && <AddedBy memberId={r.member_id} days={days} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AddedBy({ memberId, days }: { memberId: string | null; days: number }) {
  const res = useLoad<ItemCard[]>(() => {
    let q = supabase.from('item_cards').select('*').order('created_at', { ascending: false }).limit(25);
    q = memberId ? q.eq('added_by', memberId) : q.is('added_by', null).eq('added_by_role', 'producer');
    if (days) q = q.gte('created_at', new Date(Date.now() - days * 86_400_000).toISOString());
    return q;
  }, [memberId, days]);
  const typeLabel = (t: string) => ITEM_TYPES.find((x) => x.value === t)?.label ?? t;
  if (res.error) return <p className="error">{res.error}</p>;
  if (!res.data) return <p className="muted">Loading…</p>;
  return (
    <ul className="crew-items">
      {res.data.map((i) => (
        <li key={i.id}>
          <a href={href('i', i.id)}>{i.title}</a>
          <span className="muted">
            {typeLabel(i.item_type)} · {STATUS_LABEL[i.status]} · {formatTimestamp(i.created_at)}
            {i.highlight_count > 0 ? ` · ${i.highlight_count} ★` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}
