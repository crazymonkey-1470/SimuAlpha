import { useEffect, useState } from 'react';
import { errorText, supabase } from '../supabase';
import { navigate, useApp, useLoad } from '../lib';
import { EPISODE_STATUS_LABEL, ITEM_TYPES, STATUS_LABEL, type EpisodeStatus, type ItemCard } from '../types';
import ItemList from '../components/ItemList';
import { CheckIcon } from '../components/Icons';
import ShowQuote from '../components/ShowQuote';

export default function EpisodePage({ id }: { id: string }) {
  const { episodes, reloadEpisodes, me } = useApp();
  const ep = episodes.find((e) => e.id === id);

  const attached = useLoad(
    () => supabase.from('item_cards').select('*').contains('episode_ids', [id]).order('created_at'),
    [id],
  );
  const pool = useLoad(
    () =>
      supabase
        .from('item_cards')
        .select('*')
        .in('status', ['this_week', 'inbox'])
        .order('status', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(150),
    [id],
  );
  const reload = () => {
    attached.reload();
    pool.reload();
  };

  const [draft, setDraft] = useState({ title: '', recording_date: '', status: 'planning' as EpisodeStatus, notes: '' });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (ep && !dirty)
      setDraft({ title: ep.title, recording_date: ep.recording_date ?? '', status: ep.status, notes: ep.notes ?? '' });
  }, [ep, dirty]);

  if (!ep) return <p className="empty">Episode not found.</p>;

  const items = (attached.data ?? []) as ItemCard[];
  const talkItems = items.filter((i) => i.item_type !== 'fun_fact' && i.item_type !== 'guest_idea');
  const checks = [
    { ok: !!ep.recording_date, label: 'Recording date' },
    { ok: items.some((i) => i.item_type === 'guest_idea'), label: 'Guest' },
    { ok: items.some((i) => i.item_type === 'fun_fact'), label: 'Fun fact' },
    { ok: talkItems.length >= 3, label: `Discussion items (${talkItems.length}/3+)` },
    { ok: !!ep.quote_id, label: 'Quote of the show' },
  ];
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);

  async function run(op: PromiseLike<{ error: { message: string } | null }>, after?: () => void) {
    setBusy(true);
    setErr('');
    const { error } = await op;
    setBusy(false);
    if (error) return setErr(errorText(error));
    after?.();
  }

  const save = () =>
    run(
      supabase
        .from('episodes')
        .update({
          title: draft.title.trim() || ep.title,
          recording_date: draft.recording_date || null,
          status: draft.status,
          notes: draft.notes.trim() || null,
        })
        .eq('id', id),
      () => {
        setDirty(false);
        reloadEpisodes();
      },
    );

  const edit = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };

  const markAllUsed = () =>
    confirm(`Mark ${items.length === 1 ? 'the attached item' : `all ${items.length} attached items`} as used?`) &&
    run(supabase.from('items').update({ status: 'used' }).in('id', items.map((i) => i.id)), reload);

  const attach = (itemId: string) =>
    run(supabase.from('item_episodes').insert({ item_id: itemId, episode_id: id }), reload);

  const remove = () =>
    confirm('Delete this episode? Attached items are kept.') &&
    run(supabase.from('episodes').delete().eq('id', id).select('id'), () => {
      reloadEpisodes();
      navigate('episodes');
    });

  const typeLabel = (t: string) => ITEM_TYPES.find((x) => x.value === t)?.label ?? t;
  const f = filter.trim().toLowerCase();
  const candidates = ((pool.data ?? []) as ItemCard[]).filter(
    (i) => !i.episode_ids.includes(id) && (!f || `${i.title} ${i.source ?? ''} ${i.topics.join(' ')}`.toLowerCase().includes(f)),
  );

  return (
    <>
      <div className="episode-head">
        <input className="title-input" value={draft.title} onChange={(e) => edit('title', e.target.value)} aria-label="Episode title" />
        <div className="row">
          <label>
            Recording date
            <input type="date" value={draft.recording_date} onChange={(e) => edit('recording_date', e.target.value)} />
          </label>
          <label>
            Status
            <select value={draft.status} onChange={(e) => edit('status', e.target.value as EpisodeStatus)}>
              {Object.entries(EPISODE_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Notes
          <textarea rows={3} value={draft.notes} onChange={(e) => edit('notes', e.target.value)} placeholder="Theme, run of show, guest logistics…" />
        </label>
        <div className="actions">
          <button className="primary" disabled={!dirty || busy} onClick={save}>
            Save
          </button>
          {items.length > 0 && (
            <button disabled={busy} onClick={markAllUsed}>
              <CheckIcon size={16} />
              Mark {items.length === 1 ? 'it' : `all ${items.length}`} used
            </button>
          )}
          {(ep.created_by === me.id || me.role === 'producer') && (
            <button className="danger" disabled={busy} onClick={remove}>
              Delete episode
            </button>
          )}
        </div>
        {err && <p className="error">{err}</p>}
      </div>

      <ul className="checklist">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? 'ok' : 'missing'}>
            {c.ok ? <CheckIcon size={15} /> : <span className="check-empty" aria-hidden="true" />}
            <span className="sr-only">{c.ok ? 'Done: ' : 'Missing: '}</span>
            {c.label}
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <p className="warn">
          <span className="pilcrow" aria-hidden="true">¶</span>
          Still missing: {missing.join(', ')}.
        </p>
      )}

      <ShowQuote ep={ep} />

      <h2>
        Attached <span className="count">{items.length}</span>
      </h2>
      <ItemList
        items={attached.data as ItemCard[] | null}
        loading={attached.loading}
        error={attached.error}
        onChange={reload}
        empty="Nothing attached yet. Pick from this week’s pile below."
        episodeId={id}
      />

      <h2>Attach from this week &amp; inbox</h2>
      <input
        type="search"
        className="filter"
        placeholder="Filter by title, source, topic…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {pool.error && <p className="error">{pool.error}</p>}
      <div className="pick-list">
        {candidates.map((i) => (
          <div key={i.id} className="pick-row">
            <div>
              <b>{i.title}</b>
              <span className="muted">
                {typeLabel(i.item_type)} · {STATUS_LABEL[i.status]}
                {i.source ? ` · ${i.source}` : ''}
              </span>
            </div>
            <button disabled={busy} onClick={() => attach(i.id)}>
              Attach
            </button>
          </div>
        ))}
        {pool.data && candidates.length === 0 && <p className="empty">Nothing left to attach.</p>}
      </div>
    </>
  );
}
