import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../supabase';
import { formatDay, href, navigate, today, useApp, useLoad } from '../lib';
import type { QuoteCard as Quote } from '../types';
import QuoteCard from '../components/QuoteCard';
import { BackIcon } from '../components/Icons';

/** The quote bank. With an episode id, it's the picker for that episode's quote of the show. */
export default function Quotes({ episodeId }: { episodeId?: string }) {
  const { episodes, topics, me, reloadEpisodes } = useApp();
  const ep = episodeId ? episodes.find((e) => e.id === episodeId) : undefined;
  const next = episodes.find((e) => e.status === 'planning' && (!e.recording_date || e.recording_date >= today()));
  const target = ep ?? next;
  const bank = useLoad<Quote[]>(() => supabase.from('quote_cards').select('*').order('created_at', { ascending: false }), []);
  const [filter, setFilter] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ text: '', author: '', source: '', context: '', questions: '', topic: '', verified: false });

  async function run(op: PromiseLike<{ error: { message: string } | null }>, after?: () => void) {
    setBusy(true);
    setErr('');
    const { error } = await op;
    setBusy(false);
    if (error) return setErr(errorText(error));
    after?.();
  }

  const use = (quoteId: string) =>
    target &&
    run(supabase.from('episodes').update({ quote_id: quoteId }).eq('id', target.id), () => {
      reloadEpisodes();
      bank.reload();
      if (ep) navigate('e', ep.id);
    });

  async function add(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    const { data, error } = await supabase
      .from('quotes')
      .insert({
        text: draft.text,
        author: draft.author,
        source: draft.source.trim() || null,
        context: draft.context.trim() || null,
        questions: draft.questions.split('\n').map((x) => x.trim()).filter(Boolean),
        topics: draft.topic ? [draft.topic] : [],
        verified: draft.verified && !!draft.source.trim(),
      })
      .select('id')
      .single();
    setBusy(false);
    if (error) return setErr(errorText(error));
    setDraft({ text: '', author: '', source: '', context: '', questions: '', topic: '', verified: false });
    setAdding(false);
    if (ep) return use(data.id);
    bank.reload();
  }

  const f = filter.trim().toLowerCase();
  const list = (bank.data ?? [])
    .filter((q) => (!topic || q.topics.includes(topic)) && (!f || `${q.text} ${q.author} ${q.source ?? ''}`.toLowerCase().includes(f)))
    .sort((a, b) => a.used_count - b.used_count || a.author.localeCompare(b.author));

  return (
    <div className="narrow quotes-page">
      {ep ? (
        <a className="back-link" href={href('e', ep.id)}>
          <BackIcon size={16} />
          {ep.title}
        </a>
      ) : (
        <a className="back-link" href={href('episodes')}>
          <BackIcon size={16} />
          Episodes
        </a>
      )}
      <h1>{ep ? <>Choose the quote for <em>{ep.title}</em></> : <>Quote <em>bank</em></>}</h1>
      <p className="hint">
        One motivational quote per show, as the opener or the closer. New episodes get the least-used verified quote
        automatically. “Verified” means the wording and source were checked against the original.
      </p>

      <div className="actions">
        <button className={adding ? 'on' : 'primary'} onClick={() => setAdding(!adding)}>
          {adding ? 'Cancel' : 'Add a quote'}
        </button>
      </div>
      {adding && (
        <form className="research-form quote-form" onSubmit={add}>
          <textarea rows={3} required value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="The quote, word for word" aria-label="Quote" />
          <input required value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} placeholder="Who said it" aria-label="Author" />
          <input value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value, verified: draft.verified && !!e.target.value.trim() })} placeholder="Where: book and chapter, speech and date, verse…" aria-label="Source" />
          <textarea rows={2} value={draft.context} onChange={(e) => setDraft({ ...draft, context: e.target.value })} placeholder="Context: why it matters (optional)" aria-label="Context" />
          <textarea rows={2} value={draft.questions} onChange={(e) => setDraft({ ...draft, questions: e.target.value })} placeholder="Questions to talk about, one per line (optional)" aria-label="Questions" />
          <select value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} aria-label="Topic">
            <option value="">No topic</option>
            {topics.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={draft.verified} disabled={!draft.source.trim()} onChange={(e) => setDraft({ ...draft, verified: e.target.checked })} />
            I checked the exact wording against the source
          </label>
          <div className="actions">
            <button className="primary" disabled={busy || !draft.text.trim() || !draft.author.trim()}>
              {ep ? 'Add and use for this episode' : 'Add to the bank'}
            </button>
          </div>
        </form>
      )}

      <div className="feed-filters">
        <input type="search" className="filter" placeholder="Search words or author…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic">
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      {err && <p className="error">{err}</p>}
      {bank.error && <p className="error">{bank.error}</p>}
      {bank.loading && !bank.data && <p className="muted">Loading…</p>}
      <div className="list">
        {list.map((q) => {
          const current = target?.quote_id === q.id;
          return (
            <article key={q.id} className={`card quote-item ${current ? 'current' : ''}`}>
              <QuoteCard q={q} />
              <p className="card-meta">
                <span>
                  {q.used_count === 0
                    ? 'Not used yet'
                    : `Used in ${q.used_in.slice(0, 2).join(', ')}${q.used_count > 2 ? ` +${q.used_count - 2}` : ''}${q.last_used ? ` (last ${formatDay(q.last_used)})` : ''}`}
                </span>
                <span>Added by {q.added_by_name}</span>
              </p>
              <div className="actions">
                {target &&
                  (current ? (
                    <span className="badge st-this_week">On {target.title}</span>
                  ) : (
                    <button className="primary" disabled={busy} onClick={() => use(q.id)}>
                      {ep ? 'Use for this episode' : `Use for ${target.title}`}
                    </button>
                  ))}
                {(q.added_by === me.id || me.role === 'producer') && (
                  <button className="danger" disabled={busy} onClick={() => confirm('Remove this quote from the bank?') && run(supabase.from('quotes').delete().eq('id', q.id), bank.reload)}>
                    Remove
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {bank.data && list.length === 0 && <p className="empty">No quotes match.</p>}
      </div>
    </div>
  );
}
