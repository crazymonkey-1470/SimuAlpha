import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../supabase';
import { formatTimestamp, href, useApp, useLoad } from '../lib';
import type { Feed } from '../types';
import { BackIcon, RssIcon } from '../components/Icons';

export default function Sources() {
  const { me, topics } = useApp();
  const isProducer = me.role === 'producer';
  const feeds = useLoad(() => supabase.from('feeds').select('*').order('name'), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState('news');

  async function run(op: PromiseLike<{ error: { message: string } | null }>, ok?: string) {
    setBusy(true);
    const { error } = await op;
    setBusy(false);
    setMsg(error ? { ok: false, text: errorText(error) } : ok ? { ok: true, text: ok } : null);
    if (!error) feeds.reload();
    return !error;
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const link = url.trim().match(/https?:\/\/\S+/i)?.[0] ?? (url.trim() ? `https://${url.trim()}` : '');
    if (!name.trim() || !link) return;
    if (await run(supabase.from('feeds').insert({ name: name.trim(), url: link, topics: [topic] }), 'Added. It will be fetched within 20 minutes.')) {
      setName('');
      setUrl('');
    }
  }

  const list = (feeds.data ?? []) as Feed[];
  const status = (f: Feed) =>
    !f.active ? 'paused' : f.last_error ? 'error' : f.last_fetched_at ? 'ok' : 'waiting';

  return (
    <div className="narrow sources">
      <a className="back-link" href={href('feed')}>
        <BackIcon size={16} />
        Feed
      </a>
      <div className="page-head">
        <h1>
          <span>Sources</span>
        </h1>
        {isProducer && (
          <button disabled={busy} onClick={() => run(supabase.rpc('refresh_feeds'), 'Fetching every source now. Give it a minute.')}>
            <RssIcon size={16} />
            Fetch now
          </button>
        )}
      </div>
      <p className="hint">
        RSS / Atom feeds from trusted publications. The database checks each one every two hours and keeps
        headline, date, link and a short preview, never the full article.
      </p>

      {isProducer && (
        <form className="memory-form" onSubmit={add}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. The Free Press" aria-label="Source name" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Feed URL (RSS or Atom)"
            aria-label="Feed URL"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic">
            {topics.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="actions">
            <button className="primary" disabled={busy || !name.trim() || !url.trim()}>
              Add source
            </button>
          </div>
        </form>
      )}
      {msg && <p className={msg.ok ? 'success' : 'error'}>{msg.text}</p>}
      {feeds.error && <p className="error">{feeds.error}</p>}

      <div className="memory-list">
        {list.map((f) => (
          <div key={f.id} className={`memory source-row st-${status(f)}`}>
            <div className="memory-head">
              <span className={`badge src-${status(f)}`}>{status(f)}</span>
              <span className="memory-subject">{f.topics.map((t) => topics.find((x) => x.slug === t)?.name ?? t).join(', ')}</span>
            </div>
            <p className="memory-content">
              <b>{f.name}</b>
            </p>
            <p className="card-meta source-url">
              <span>{f.url}</span>
            </p>
            <p className="card-meta">
              <span>
                {f.last_fetched_at ? `checked ${formatTimestamp(f.last_fetched_at)}` : 'not checked yet'}
                {f.last_new_count != null && !f.last_error ? ` · ${f.last_new_count} new` : ''}
              </span>
            </p>
            {f.last_error && <p className="error">{f.last_error}</p>}
            {isProducer && (
              <div className="actions">
                <button disabled={busy} onClick={() => run(supabase.from('feeds').update({ active: !f.active }).eq('id', f.id))}>
                  {f.active ? 'Pause' : 'Resume'}
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => confirm(`Remove ${f.name} and its headlines?`) && run(supabase.from('feeds').delete().eq('id', f.id))}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
