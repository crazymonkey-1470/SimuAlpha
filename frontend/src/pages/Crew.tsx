import { useState } from 'react';
import { errorText, supabase } from '../supabase';
import { copyText, formatTimestamp, freshness, href, roman, useApp, useLoad } from '../lib';
import { ITEM_TYPES, STATUS_LABEL, type CrewStat, type ItemCard } from '../types';

/** The non-zero numbers worth showing for one row, in reading order. */
function stats(r: CrewStat): [number, string][] {
  const all: [number, string][] = r.member_id
    ? [
        [r.from_feed, 'from the Feed'],
        [r.nominated, 'nominated'],
        [r.on_air, 'on air'],
        [r.liked, 'liked in the Feed'],
        [r.stars_given, '★ given'],
        [r.stars_received, '★ received'],
        [r.comments, r.comments === 1 ? 'comment' : 'comments'],
        [r.episodes, r.episodes === 1 ? 'episode planned' : 'episodes planned'],
        [r.quotes, r.quotes === 1 ? 'quote added' : 'quotes added'],
        [r.days_marked, r.days_marked === 1 ? 'day marked' : 'days marked'],
        [r.research, 'asked of Grok'],
        [r.passed, 'passed on'],
      ]
    : [
        [r.reads, r.reads === 1 ? 'verified read' : 'verified reads'],
        [r.research, 'research answered'],
        [r.comments, 'comments'],
      ];
  return all.filter(([n]) => n > 0);
}

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
  const [nudge, setNudge] = useState<{ ok: boolean; text: string } | null>(null);
  const [nudging, setNudging] = useState(false);
  const rows = board.data ?? [];

  /** Share "what the next episode needs" to the group chat (share sheet on phones, clipboard elsewhere). */
  async function shareNudge() {
    setNudging(true);
    setNudge(null);
    const { data, error } = await supabase.rpc('crew_nudge', { member: null });
    setNudging(false);
    if (error) return setNudge({ ok: false, text: errorText(error) });
    const n = data as { title: string; body: string; url: string };
    const text = `${n.title}: ${n.body}\n${location.origin}${location.pathname}${n.url}`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return setNudge({ ok: true, text: 'Shared.' });
      }
    } catch {
      /* share sheet closed: fall back to copying */
    }
    setNudge((await copyText(text)) ? { ok: true, text: 'Copied. Paste it into the group chat.' } : { ok: false, text });
  }

  async function nudgeInboxes() {
    if (!confirm('Send this week’s nudge to everyone’s inbox (and their phones, if they turned notifications on)?')) return;
    setNudging(true);
    const { data, error } = await supabase.rpc('create_weekly_nudges', { force: true });
    setNudging(false);
    setNudge(error ? { ok: false, text: errorText(error) } : { ok: true, text: `Sent to ${data} ${data === 1 ? 'inbox' : 'inboxes'}.` });
  }
  const leader = rows[0]?.added ? rows[0] : null;

  return (
    <div className="narrow crew-page">
      <h1>
        Crew <em>board</em>
      </h1>
      <p className="hint">
        Who’s bringing material to the prep room. <b>Added</b> counts everything put in the prep room: from the Feed’s
        “Discuss this”, the Add tab, or the producer’s database commands (Grok’s picks). <b>Nominated</b> means picked
        for This week and <b>on air</b> means used in an episode. Feed likes, stars, comments, episodes, quotes and
        calendar days count too.
      </p>
      <div className="segmented" role="tablist">
        {PERIODS.map((p) => (
          <button key={p.days} role="tab" aria-selected={days === p.days} className={days === p.days ? 'on' : ''} onClick={() => setDays(p.days)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="actions nudge-actions">
        <button disabled={nudging} onClick={shareNudge}>
          Nudge the group chat
        </button>
        {me.role === 'producer' && (
          <button disabled={nudging} onClick={nudgeInboxes}>
            Nudge everyone’s inbox
          </button>
        )}
      </div>
      {nudge && <p className={nudge.ok ? 'success' : 'error'}>{nudge.text}</p>}
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
                    {r.last_active ? `last active ${freshness(r.last_active.slice(0, 10))}` : 'no activity in this period'}
                  </span>
                </div>
                <span className="crew-count">
                  {r.added}
                  <small>added</small>
                </span>
              </div>
              <p className="crew-stats">
                {stats(r).map(([n, label]) => (
                  <span key={label}>
                    <b>{n}</b> {label}
                  </span>
                ))}
                {stats(r).length === 0 && <span>Nothing yet in this period.</span>}
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
