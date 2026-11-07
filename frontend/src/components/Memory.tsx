import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../supabase';
import { formatTimestamp, useApp } from '../lib';
import { MEMORY_KIND_LABEL, type MemoryCard, type MemoryKind } from '../types';

export const MEMORY_COLUMNS = '*';

/** One memory with pin / "not true anymore" / delete controls. */
export function MemoryRow({ m, onChange, showSubject = true }: { m: MemoryCard; onChange: () => void; showSubject?: boolean }) {
  const { me } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const canManage = me.role === 'producer' || m.about_member === me.id || m.created_by === me.id;

  async function run(op: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setErr('');
    const { error } = await op;
    setBusy(false);
    if (error) setErr(errorText(error));
    else onChange();
  }

  return (
    <div className={`memory ${m.pinned ? 'pinned' : ''}`}>
      <div className="memory-head">
        <span className={`badge mk-${m.kind}`}>{MEMORY_KIND_LABEL[m.kind]}</span>
        {showSubject && <span className="memory-subject">{m.subject}</span>}
        {m.pinned && <span className="memory-pin">📌 always remembered</span>}
      </div>
      <p className="memory-content">{m.content}</p>
      <p className="card-meta">
        <span>
          {m.source === 'grok' ? 'learned by Grok' : `added by ${m.created_by_name}`} · {formatTimestamp(m.created_at)}
          {m.reinforced_count > 0 ? ` · confirmed ${m.reinforced_count}×` : ''}
        </span>
      </p>
      {canManage && (
        <div className="actions">
          <button disabled={busy} onClick={() => run(supabase.from('memories').update({ pinned: !m.pinned }).eq('id', m.id))}>
            {m.pinned ? 'Unpin' : '📌 Pin'}
          </button>
          <button disabled={busy} onClick={() => run(supabase.rpc('forget', { memory_id: m.id, reason: 'marked not true on the site' }))}>
            Not true anymore
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => confirm('Delete this memory for good?') && run(supabase.from('memories').delete().eq('id', m.id))}
          >
            Delete
          </button>
        </div>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}

/** Add a memory: about the signed-in person (aboutMe) or show-wide / a topic. */
export function MemoryForm({ aboutMe, onDone }: { aboutMe?: boolean; onDone: () => void }) {
  const { me, topics } = useApp();
  const kinds: MemoryKind[] = aboutMe ? ['preference', 'fact', 'instruction'] : ['instruction', 'fact', 'preference', 'event'];
  const [kind, setKind] = useState<MemoryKind>(kinds[0]);
  const [content, setContent] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc('remember', {
      content: content.trim(),
      kind,
      about_member: aboutMe ? me.id : null,
      about_topic: !aboutMe && topic ? topic : null,
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setContent('');
    setErr('');
    onDone();
  }

  const placeholder = aboutMe
    ? kind === 'preference'
      ? 'e.g. I like history deep dives; skip celebrity news'
      : kind === 'instruction'
        ? 'e.g. Give me the numbers first, then the story'
        : 'e.g. I run the fitness segment'
    : kind === 'instruction'
      ? 'e.g. Always cite sources and keep answers under 200 words'
      : 'Something Grok should always know about the show';

  return (
    <form className="memory-form" onSubmit={submit}>
      <div className="kind-picker" role="radiogroup" aria-label="Kind of memory">
        {kinds.map((k) => (
          <button type="button" key={k} role="radio" aria-checked={kind === k} className={'chip ' + (kind === k ? 'on' : '')} onClick={() => setKind(k)}>
            {MEMORY_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <textarea rows={2} value={content} onChange={(e) => setContent(e.target.value)} placeholder={placeholder} aria-label="Memory" />
      {!aboutMe && (
        <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="About">
          <option value="">About the whole show</option>
          {topics.map((t) => (
            <option key={t.slug} value={t.slug}>
              About {t.name}
            </option>
          ))}
        </select>
      )}
      {err && <p className="error">{err}</p>}
      <div className="actions">
        <button className="primary" disabled={busy || !content.trim()}>
          {busy ? 'Saving…' : aboutMe ? 'Tell Grok' : 'Remember this'}
        </button>
      </div>
    </form>
  );
}
