import { useEffect, useRef, useState } from 'react';
import { errorText, supabase } from '../supabase';
import { formatTimestamp, useLoad } from '../lib';
import type { AppNotification } from '../types';

const KIND: Record<AppNotification['kind'], string> = { mention: 'Mention', answer: 'Answer', nudge: 'This week', test: 'Test' };

/** Your notes: mentions, answers to your questions, and the weekly nudge. */
export default function Inbox({ onRead }: { onRead: () => void }) {
  const res = useLoad<AppNotification[]>(
    () => supabase.from('notifications').select('id, member_id, kind, title, body, url, created_at, read_at').order('created_at', { ascending: false }).limit(100),
    [],
  );
  const [err, setErr] = useState('');
  const fresh = useRef<Set<string> | null>(null);
  const list = res.data ?? [];
  if (res.data && !fresh.current) fresh.current = new Set(res.data.filter((n) => !n.read_at).map((n) => n.id));

  // Opening the inbox marks everything read (the "new" tags stay until you leave).
  useEffect(() => {
    if (!res.data || !res.data.some((n) => !n.read_at)) return;
    supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .then(({ error }) => (error ? setErr(errorText(error)) : onRead()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res.data]);

  async function clear() {
    if (!confirm('Clear your whole inbox?')) return;
    const { error } = await supabase.from('notifications').delete().not('id', 'is', null);
    if (error) return setErr(errorText(error));
    fresh.current = new Set();
    res.reload();
    onRead();
  }

  return (
    <div className="narrow inbox-page">
      <div className="page-head">
        <h1>
          Your <em>inbox</em>
        </h1>
        {list.length > 0 && <button onClick={clear}>Clear all</button>}
      </div>
      <p className="hint">
        When someone writes @your-name in a comment, when Grok answers your question, and the weekly “what the next
        episode needs”. Turn on phone notifications under Account.
      </p>
      {(res.error || err) && <p className="error">{res.error || err}</p>}
      {res.loading && !res.data && <p className="muted">Loading…</p>}
      {res.data && list.length === 0 && <p className="empty">Nothing here yet.</p>}
      <div className="list">
        {list.map((n) => {
          const isNew = fresh.current?.has(n.id);
          const body = (
            <>
              <div className="card-top">
                <span className={`badge nk-${n.kind}`}>{KIND[n.kind] ?? n.kind}</span>
                {isNew && <span className="badge st-this_week">New</span>}
              </div>
              <b className="note-title">{n.title}</b>
              {n.body && <p className="note-body">{n.body}</p>}
              <span className="muted small">{formatTimestamp(n.created_at)}</span>
            </>
          );
          return n.url ? (
            <a key={n.id} className={`card note ${isNew ? 'new' : ''}`} href={n.url}>
              {body}
            </a>
          ) : (
            <div key={n.id} className={`card note ${isNew ? 'new' : ''}`}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
