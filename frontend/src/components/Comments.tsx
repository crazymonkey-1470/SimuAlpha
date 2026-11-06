import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../supabase';
import { formatTimestamp, useApp, useLoad } from '../lib';
import type { Comment } from '../types';

export default function Comments({ itemId, onCountChange }: { itemId: string; onCountChange: () => void }) {
  const { me, profiles } = useApp();
  const list = useLoad(
    () => supabase.from('comments').select('*').eq('item_id', itemId).order('created_at'),
    [itemId],
  );
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function done(error: { message: string } | null) {
    setBusy(false);
    if (error) return setErr(errorText(error));
    setErr('');
    list.reload();
    onCountChange();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('comments').insert({ item_id: itemId, body: body.trim() });
    if (!error) setBody('');
    done(error);
  }

  async function remove(id: string) {
    if (!confirm('Delete this comment?')) return;
    setBusy(true);
    const { error } = await supabase.from('comments').delete().eq('id', id);
    done(error);
  }

  const comments = (list.data ?? []) as Comment[];
  const author = (c: Comment) =>
    (c.author_id && profiles.get(c.author_id)?.display_name) || (c.author_role === 'producer' ? 'Producer' : 'Former member');

  return (
    <div className="comments">
      {list.loading && !list.data && <p className="muted">Loading comments…</p>}
      {list.error && <p className="error">{list.error}</p>}
      {comments.map((c) => (
        <div key={c.id} className={`comment ${c.author_role}`}>
          <div className="comment-head">
            <b>{author(c)}</b> <span className="muted">{formatTimestamp(c.created_at)}</span>
            {(c.author_id === me.id || me.role === 'producer') && (
              <button className="link" disabled={busy} onClick={() => remove(c.id)}>
                delete
              </button>
            )}
          </div>
          <p>{c.body}</p>
        </div>
      ))}
      <form onSubmit={add} className="comment-form">
        <textarea
          rows={2}
          placeholder="Add a comment, angle, or counterpoint…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button className="primary" disabled={busy || !body.trim()}>
          Post
        </button>
      </form>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
