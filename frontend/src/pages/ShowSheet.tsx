import { useEffect, useState } from 'react';
import { errorText, supabase } from '../supabase';
import { formatDay, href, useApp, useLoad } from '../lib';
import type { ItemCard, QuoteCard as Quote } from '../types';
import { BackIcon } from '../components/Icons';

const rank = (i: ItemCard) => (i.item_type === 'fun_fact' ? 1 : i.item_type === 'guest_idea' ? 2 : 0);

/** One page to record from: opening quote, the items in running order, closing quote. Prints cleanly. */
export default function ShowSheet({ id }: { id: string }) {
  const { episodes, reloadEpisodes } = useApp();
  const ep = episodes.find((e) => e.id === id);
  // Recording from this page: always show the latest quote and title, not what was loaded at sign-in.
  useEffect(() => reloadEpisodes(), [id, reloadEpisodes]);
  const items = useLoad<ItemCard[]>(() => supabase.from('item_cards').select('*').contains('episode_ids', [id]), [id]);
  const links = useLoad<{ item_id: string; position: number | null; created_at: string }[]>(
    () => supabase.from('item_episodes').select('item_id, position, created_at').eq('episode_id', id),
    [id],
  );
  const quote = useLoad<Quote>(
    () =>
      ep?.quote_id
        ? supabase.from('quote_cards').select('*').eq('id', ep.quote_id).maybeSingle<Quote>()
        : Promise.resolve({ data: null, error: null }),
    [ep?.quote_id],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Keep the screen awake while the sheet is open (an iPad on a stand during recording).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, []);

  if (!ep) return <p className="empty">Episode not found.</p>;

  const pos = new Map((links.data ?? []).map((l) => [l.item_id, l]));
  const ordered = [...(items.data ?? [])].sort((a, b) => {
    const pa = pos.get(a.id)?.position;
    const pb = pos.get(b.id)?.position;
    if (pa != null && pb != null) return pa - pb;
    if (pa != null) return -1;
    if (pb != null) return 1;
    return rank(a) - rank(b) || (pos.get(a.id)?.created_at ?? '').localeCompare(pos.get(b.id)?.created_at ?? '');
  });

  async function move(index: number, by: number) {
    const next = [...ordered];
    const [it] = next.splice(index, 1);
    next.splice(index + by, 0, it);
    setBusy(true);
    setErr('');
    const { error } = await supabase.rpc('set_running_order', { episode: id, items: next.map((i) => i.id) });
    setBusy(false);
    if (error) return setErr(errorText(error));
    links.reload();
  }

  const q = ep.quote_id ? quote.data : null;
  const quoteBlock = q && (
    <section className="sheet-quote">
      <span className="eyebrow">{ep.quote_role === 'opener' ? 'Opening quote' : 'Closing quote'}</span>
      <blockquote>{q.text}</blockquote>
      <p className="sheet-by">
        <b>{q.author}</b>
        {q.source ? ` · ${q.source}` : ''}
      </p>
      {q.questions.length > 0 && (
        <ul className="points">
          {q.questions.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
    </section>
  );
  let story = 0;

  return (
    <div className="sheet">
      <div className="sheet-tools no-print">
        <a className="back-link" href={href('e', id)}>
          <BackIcon size={16} />
          Episode plan
        </a>
        <button onClick={() => window.print()}>Print</button>
      </div>
      <header className="sheet-head">
        <span className="eyebrow">The True Adam Podcast · show sheet</span>
        <h1>{ep.title}</h1>
        <p className="muted">
          {ep.recording_date ? formatDay(ep.recording_date) : 'No recording date yet'} · {ordered.length}{' '}
          {ordered.length === 1 ? 'segment' : 'segments'}
        </p>
        {ep.notes && <p className="sheet-notes">{ep.notes}</p>}
      </header>

      {ep.quote_role === 'opener' && quoteBlock}
      {(items.error || links.error || err) && <p className="error">{items.error || links.error || err}</p>}
      {items.loading && !items.data && <p className="muted">Loading…</p>}
      {items.data && ordered.length === 0 && (
        <p className="empty">Nothing is attached to this episode yet. Attach items on the episode plan.</p>
      )}

      <ol className="sheet-list">
        {ordered.map((i, index) => {
          const label = i.item_type === 'fun_fact' ? 'Fun fact' : i.item_type === 'guest_idea' ? 'Guest' : `Story ${++story}`;
          return (
            <li key={i.id} className={`sheet-item type-${i.item_type}`}>
              <div className="sheet-item-head">
                <span className="eyebrow">{label}</span>
                <span className="sheet-move no-print">
                  <button disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${i.title} up`}>
                    ↑
                  </button>
                  <button disabled={busy || index === ordered.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${i.title} down`}>
                    ↓
                  </button>
                </span>
              </div>
              <h2>{i.title}</h2>
              {(i.source || i.published_at || i.guest_name) && (
                <p className="sheet-by">
                  {i.guest_name && <b>{i.guest_name} </b>}
                  {[i.source, i.published_at ? formatDay(i.published_at) : null].filter(Boolean).join(' · ')}
                </p>
              )}
              {i.summary && <p className="sheet-summary">{i.summary}</p>}
              {i.why_them && <p className="sheet-summary">{i.why_them}</p>}
              {i.quote && <blockquote>{i.quote.replace(/^[“"]+|[”"]+$/g, '')}</blockquote>}
              {i.talking_points.length > 0 && (
                <ul className="points">
                  {i.talking_points.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {ep.quote_role === 'closer' && quoteBlock}
    </div>
  );
}
