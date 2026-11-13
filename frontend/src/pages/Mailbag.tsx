import { useState } from 'react';
import { errorText, supabase } from '../supabase';
import { copyText, formatTimestamp, href, useApp, useLoad } from '../lib';
import type { ListenerQuestion } from '../types';

/** Listener questions from the public "Ask the show" page. */
export default function Mailbag() {
  const { me } = useApp();
  const [showAll, setShowAll] = useState(false);
  const res = useLoad<ListenerQuestion[]>(
    () => supabase.from('listener_questions').select('id, name, location, question, status, item_id, created_at').order('created_at', { ascending: false }).limit(200),
    [],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${location.pathname}#/ask`;

  async function run(op: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setErr('');
    const { error } = await op;
    setBusy(false);
    if (error) return setErr(errorText(error));
    res.reload();
  }

  const all = res.data ?? [];
  const list = all.filter((q) => showAll || q.status === 'new');
  const handled = all.length - all.filter((q) => q.status === 'new').length;

  return (
    <>
      <p className="hint">
        Questions listeners send from the public “Ask the show” page. Send the good ones to the prep room for a mailbag
        segment.
      </p>
      <div className="share-link">
        <span className="small">Share this link with listeners:</span>
        <code>{link}</code>
        <button
          onClick={async () => {
            setCopied(await copyText(link));
            window.setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      {handled > 0 && (
        <label className="check">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show {handled} already handled
        </label>
      )}
      {(res.error || err) && <p className="error">{res.error || err}</p>}
      {res.loading && !res.data && <p className="muted">Loading…</p>}
      {res.data && list.length === 0 && <p className="empty">No new questions. Share the link above to fill the mailbag.</p>}
      <div className="list">
        {list.map((q) => (
          <article key={q.id} className={`card question st-${q.status}`}>
            <div className="card-top">
              {q.status !== 'new' && <span className="badge">{q.status === 'saved' ? 'In the prep room' : 'Dismissed'}</span>}
            </div>
            <p className="question-text">{q.question}</p>
            <p className="card-meta">
              <b>{[q.name, q.location].filter(Boolean).join(', ') || 'Anonymous'}</b>
              <span>{formatTimestamp(q.created_at)}</span>
            </p>
            <div className="actions">
              {q.item_id ? (
                <a className="button" href={href('i', q.item_id)}>
                  Open in prep room
                </a>
              ) : (
                <button className="primary" disabled={busy} onClick={() => run(supabase.rpc('question_to_item', { question_id: q.id }))}>
                  Send to prep room
                </button>
              )}
              {q.status === 'new' && (
                <button disabled={busy} onClick={() => run(supabase.from('listener_questions').update({ status: 'dismissed' }).eq('id', q.id))}>
                  Dismiss
                </button>
              )}
              {q.status === 'dismissed' && (
                <button disabled={busy} onClick={() => run(supabase.from('listener_questions').update({ status: 'new' }).eq('id', q.id))}>
                  Restore
                </button>
              )}
              {me.role === 'producer' && (
                <button className="danger" disabled={busy} onClick={() => confirm('Delete this question for good?') && run(supabase.from('listener_questions').delete().eq('id', q.id))}>
                  Delete
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
