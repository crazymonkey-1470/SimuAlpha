import { useEffect, useState, type FormEvent } from 'react';
import { errorText, supabase } from '../supabase';
import { copyText, formatTimestamp, href, useApp } from '../lib';
import {
  RESEARCH_KIND_LABEL,
  RESEARCH_STATUS_LABEL,
  type ItemCard,
  type ResearchKind,
  type ResearchRequest,
  type ResearchStatus,
} from '../types';

/** Form to ask the Grok bot for something, optionally tied to an item. */
export function ResearchForm({
  item,
  onDone,
  onCancel,
}: {
  item?: Pick<ItemCard, 'id' | 'title'>;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [kind, setKind] = useState<ResearchKind>('deep_research');
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!request.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from('research_requests')
      .insert({ kind, request: request.trim(), item_id: item?.id ?? null });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setRequest('');
    setErr('');
    onDone();
  }

  return (
    <form className="research-form" onSubmit={submit}>
      <div className="research-form-head">
        <span className="eyebrow">
          <span className="dot" /> Ask Grok{item ? ' about this' : ''}
        </span>
      </div>
      <div className="kind-picker" role="radiogroup" aria-label="Kind of request">
        {(Object.keys(RESEARCH_KIND_LABEL) as ResearchKind[]).map((k) => (
          <button
            type="button"
            key={k}
            role="radio"
            aria-checked={kind === k}
            className={'chip ' + (kind === k ? 'on' : '')}
            onClick={() => setKind(k)}
          >
            {RESEARCH_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        required
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        placeholder={
          kind === 'stats'
            ? 'e.g. Marriage rate for men 25–35, 1990 vs today, with sources'
            : kind === 'fact_check'
              ? 'Paste the claim to check…'
              : 'What should Grok dig into?'
        }
        aria-label="Request"
      />
      {err && <p className="error">{err}</p>}
      <div className="actions">
        <button className="primary" disabled={busy || !request.trim()}>
          {busy ? 'Sending…' : 'Send to queue'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

interface Briefing {
  member?: { name: string } | null;
  pinned?: string[];
  preferences?: string[];
  instructions?: string[];
  favorite_topics?: { topic: string }[];
}

/** Prompt for Grok: the request, the article, who asked and what Grok already knows about them. */
function promptFor(r: ResearchRequest, who?: Briefing | null, show?: Briefing | null): string {
  const lines = [`True Adam Podcast research request (${RESEARCH_KIND_LABEL[r.kind]})`, '', r.request];
  if (r.items) {
    lines.push('', `Context: ${r.items.title}${r.items.url ? ` (${r.items.url})` : ''}`);
    if (r.items.summary) lines.push(r.items.summary);
  }
  const rules = [...(show?.pinned ?? []), ...(show?.instructions ?? [])].slice(0, 6);
  if (rules.length) lines.push('', 'House rules:', ...rules.map((x) => `- ${x}`));
  if (who?.member) {
    const about = [
      ...(who.pinned ?? []),
      ...(who.preferences ?? []).slice(0, 6),
      ...(who.instructions ?? []).slice(0, 3),
    ];
    const topics = (who.favorite_topics ?? []).slice(0, 4).map((t) => t.topic);
    if (about.length || topics.length) {
      lines.push('', `About ${who.member.name} (who asked):`);
      about.forEach((x) => lines.push(`- ${x}`));
      if (topics.length) lines.push(`- Most engaged topics: ${topics.join(', ')}`);
    }
  }
  lines.push(
    '',
    'Reply with a concise answer, the key numbers, and links to your sources.',
    'Then list anything new you learned about what this person likes, one per line, under "LEARNED:".',
  );
  return lines.join('\n');
}

/** One request with its answer and controls. */
export function ResearchCard({
  r,
  onChange,
  showItem = true,
}: {
  r: ResearchRequest;
  onChange: () => void;
  showItem?: boolean;
}) {
  const { me, profiles } = useApp();
  const [answering, setAnswering] = useState(false);
  const [response, setResponse] = useState(r.response ?? '');
  const [sources, setSources] = useState(r.sources.join('\n'));
  const [fromGrok, setFromGrok] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [learned, setLearned] = useState('');
  const [context, setContext] = useState<{ who: Briefing | null; show: Briefing | null }>({ who: null, show: null });
  const isOpen = r.status === 'open' || r.status === 'in_progress';
  const canTeach = !!r.requested_by && (r.requested_by === me.id || me.role === 'producer');

  // Fetch Grok's context ahead of time: iOS Safari only allows clipboard writes straight from a tap.
  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    Promise.all([
      r.requested_by ? supabase.rpc('member_briefing', { member: r.requested_by }) : Promise.resolve({ data: null }),
      supabase.rpc('show_briefing'),
    ]).then(([w, sh]) => live && setContext({ who: (w.data as Briefing) ?? null, show: (sh.data as Briefing) ?? null }));
    return () => {
      live = false;
    };
  }, [isOpen, r.requested_by]);

  const requester =
    (r.requested_by && profiles.get(r.requested_by)?.display_name) ||
    (r.requested_by_role === 'producer' ? 'Producer' : 'Former member');
  const canDelete = r.requested_by === me.id || me.role === 'producer';

  async function run(op: PromiseLike<{ error: { message: string } | null }>, after?: () => void) {
    setBusy(true);
    setErr('');
    const { error } = await op;
    setBusy(false);
    if (error) return setErr(errorText(error));
    after?.();
    onChange();
  }

  const setStatus = (status: ResearchStatus) =>
    run(supabase.from('research_requests').update({ status }).eq('id', r.id));

  const saveAnswer = (e: FormEvent) => {
    e.preventDefault();
    if (!response.trim()) return;
    const notes = learned.split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
    run(
      supabase
        .from('research_requests')
        .update({
          response: response.trim(),
          sources: sources.split('\n').map((s) => s.trim()).filter(Boolean),
          // Unlabelled answers are credited to the person pasting them (DB trigger).
          answered_by: fromGrok ? 'Grok' : r.answered_by && r.answered_by !== 'Grok' ? r.answered_by : null,
        })
        .eq('id', r.id)
        .then(async (res) => {
          if (res.error || !notes.length || !r.requested_by) return res;
          for (const content of notes) {
            const m = await supabase.rpc('remember', {
              content,
              kind: 'preference',
              about_member: r.requested_by,
              source_research: r.id,
            });
            if (m.error) return m;
          }
          return res;
        }),
      () => {
        setAnswering(false);
        setLearned('');
      },
    );
  };

  const copy = async () => {
    setCopied(await copyText(promptFor(r, context.who, context.show)));
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className={`research-card st-${r.status}`}>
      <div className="card-top">
        <span className="badge kind">{RESEARCH_KIND_LABEL[r.kind]}</span>
        <span className={`badge rs-${r.status}`}>{RESEARCH_STATUS_LABEL[r.status]}</span>
      </div>
      <p className="research-request">{r.request}</p>
      {showItem && r.items && (
        <a className="research-item" href={href('i', r.items.id)}>
          ↳ {r.items.title}
        </a>
      )}
      <p className="card-meta">
        <span>
          asked by {requester} · {formatTimestamp(r.created_at)}
        </span>
      </p>

      {r.response && !answering && (
        <div className="answer">
          <h4>
            Answer <span>· {r.answered_by ?? 'Grok'}{r.answered_at ? ` · ${formatTimestamp(r.answered_at)}` : ''}</span>
          </h4>
          <p>{r.response}</p>
          {r.sources.length > 0 && (
            <ul className="sources">
              {r.sources.map((s, i) => (
                <li key={i}>
                  {/^https?:\/\//i.test(s) ? (
                    <a href={s} target="_blank" rel="noopener noreferrer">
                      {s.replace(/^https?:\/\/(www\.)?/, '')}
                    </a>
                  ) : (
                    s
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {answering && (
        <form className="answer-form" onSubmit={saveAnswer}>
          <label>
            Answer
            <textarea rows={6} value={response} onChange={(e) => setResponse(e.target.value)} required />
          </label>
          <label>
            Sources <span className="muted">(one link per line)</span>
            <textarea rows={2} value={sources} onChange={(e) => setSources(e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={fromGrok} onChange={(e) => setFromGrok(e.target.checked)} />
            This answer came from Grok
          </label>
          {canTeach && (
            <label>
              What did Grok learn about {requester}? <span className="muted">(optional, one per line — saved to its memory)</span>
              <textarea rows={2} value={learned} onChange={(e) => setLearned(e.target.value)} placeholder="e.g. Wants the original study, not news coverage" />
            </label>
          )}
          <div className="actions">
            <button className="primary" disabled={busy || !response.trim()}>
              Save answer
            </button>
            <button type="button" onClick={() => setAnswering(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {err && <p className="error">{err}</p>}

      {!answering && (
        <div className="actions">
          {(r.status === 'open' || r.status === 'in_progress') && (
            <button onClick={copy} disabled={busy}>
              {copied ? '✓ Copied' : 'Copy for Grok'}
            </button>
          )}
          <button onClick={() => setAnswering(true)} disabled={busy}>
            {r.response ? 'Edit answer' : 'Paste answer'}
          </button>
          {r.status === 'open' && (
            <button onClick={() => setStatus('in_progress')} disabled={busy}>
              In progress
            </button>
          )}
          {(r.status === 'open' || r.status === 'in_progress') && (
            <button onClick={() => setStatus('cancelled')} disabled={busy}>
              Cancel
            </button>
          )}
          {(r.status === 'done' || r.status === 'cancelled') && (
            <button onClick={() => setStatus('open')} disabled={busy}>
              Reopen
            </button>
          )}
          {canDelete && (
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                confirm('Delete this request?') && run(supabase.from('research_requests').delete().eq('id', r.id))
              }
            >
              Delete
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export const RESEARCH_SELECT = '*, items(id, title, url, source, summary)';
