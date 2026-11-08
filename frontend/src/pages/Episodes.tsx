import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../supabase';
import { formatDay, freshness, href, navigate, useApp, useLoad } from '../lib';
import { EPISODE_STATUS_LABEL, type Episode } from '../types';

export default function Episodes() {
  const { episodes, reloadEpisodes } = useApp();
  const links = useLoad(() => supabase.from('item_episodes').select('episode_id'), [episodes]);
  const counts = new Map<string, number>();
  for (const l of (links.data ?? []) as { episode_id: string }[]) counts.set(l.episode_id, (counts.get(l.episode_id) ?? 0) + 1);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('episodes')
      .insert({ title: title.trim(), recording_date: date || null })
      .select('id')
      .single();
    setBusy(false);
    if (error) return setErr(errorText(error));
    reloadEpisodes();
    navigate('e', data.id);
  }

  const planning = episodes.filter((e) => e.status === 'planning');
  const done = episodes
    .filter((e) => e.status !== 'planning')
    .sort((a, b) => (b.recording_date ?? '').localeCompare(a.recording_date ?? ''));

  const row = (e: Episode) => (
    <a key={e.id} className="episode-row" href={href('e', e.id)}>
      <div>
        <b>{e.title}</b>
        <span className="muted">
          {e.recording_date ? `${formatDay(e.recording_date)} (${freshness(e.recording_date)})` : 'No date yet'}
        </span>
      </div>
      <div className="right">
        <span className={`badge ep-${e.status}`}>{EPISODE_STATUS_LABEL[e.status]}</span>
        <span className="muted">{counts.get(e.id) ?? 0} items</span>
      </div>
    </a>
  );

  return (
    <>
      <div className="page-head">
        <h1>Episode ideas</h1>
        <a className="button" href={href('quotes')}>
          Quote bank
        </a>
      </div>
      <form className="inline-form" onSubmit={create}>
        <input placeholder="New episode title or theme" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Recording date" />
        <button className="primary" disabled={busy || !title.trim()}>
          Create
        </button>
      </form>
      {err && <p className="error">{err}</p>}

      <h2>Planning</h2>
      {planning.length ? <div className="episode-list">{planning.map(row)}</div> : <p className="empty">No episodes in planning.</p>}

      {done.length > 0 && (
        <>
          <h2>Recorded &amp; published</h2>
          <div className="episode-list">{done.map(row)}</div>
        </>
      )}
    </>
  );
}
