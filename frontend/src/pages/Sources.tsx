import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../supabase';
import { copyText, formatTimestamp, href, useApp, useLoad } from '../lib';
import type { Feed, FeedKind } from '../types';
import { BackIcon, RssIcon } from '../components/Icons';

const KINDS: { value: FeedKind; label: string; placeholder: string; hint: string }[] = [
  { value: 'rss', label: 'News / blog feed', placeholder: 'RSS or Atom feed URL', hint: 'Paste the site’s RSS or Atom feed address.' },
  { value: 'youtube', label: 'YouTube channel', placeholder: 'Channel link or @handle', hint: 'Paste the channel link (youtube.com/@name) or just @name.' },
  { value: 'podcast', label: 'Podcast', placeholder: 'Show name, Apple Podcasts link or RSS URL', hint: 'Type the show’s name; the worker finds its feed.' },
];
const KIND_LABEL: Record<FeedKind, string> = { rss: 'Feed', youtube: 'YouTube', podcast: 'Podcast' };

interface IngestStatus {
  mode: 'worker' | 'database';
  worker_last_run_at: string | null;
  worker_version: string | null;
  active_tokens: number;
}

/** Turn what the person typed into a feeds row (url + whether the worker still has to resolve it). */
function toFeed(kind: FeedKind, raw: string): { url: string; input_url: string; resolved: boolean } {
  const s = raw.trim();
  const link = s.match(/https?:\/\/\S+/i)?.[0];
  if (kind === 'youtube') {
    const id = s.match(/(?:channel_id=|youtube\.com\/channel\/)(UC[\w-]{22})/)?.[1];
    if (id) return { url: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, input_url: s, resolved: true };
    const handle = s.match(/@[\w.-]+/)?.[0] ?? (link ? null : `@${s.replace(/^@/, '')}`);
    return { url: link ?? `https://www.youtube.com/${handle}`, input_url: s, resolved: false };
  }
  if (kind === 'podcast') {
    if (link && !/podcasts\.apple\.com/i.test(link)) return { url: link, input_url: s, resolved: true };
    if (link) return { url: link, input_url: link, resolved: false };
    return { url: `https://itunes.apple.com/search?media=podcast&entity=podcast&term=${encodeURIComponent(s)}`, input_url: s, resolved: false };
  }
  return { url: link ?? `https://${s}`, input_url: s, resolved: true };
}

export default function Sources() {
  const { me, topics } = useApp();
  const isProducer = me.role === 'producer';
  const feeds = useLoad(() => supabase.from('feeds').select('*').order('kind').order('name'), []);
  const status = useLoad(() => supabase.rpc('ingest_status'), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [kind, setKind] = useState<FeedKind>('rss');
  const [name, setName] = useState('');
  const [input, setInput] = useState('');
  const [topic, setTopic] = useState('news');

  async function run(op: PromiseLike<{ error: { message: string } | null }>, ok?: string) {
    setBusy(true);
    const { error } = await op;
    setBusy(false);
    setMsg(error ? { ok: false, text: errorText(error) } : ok ? { ok: true, text: ok } : null);
    if (!error) {
      feeds.reload();
      status.reload();
    }
    return !error;
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const f = toFeed(kind, input);
    const label = name.trim() || (kind === 'podcast' && !/^https?:/i.test(input.trim()) ? input.trim() : '') || f.input_url;
    const ok = await run(
      supabase.from('feeds').insert({ name: label, kind, url: f.url, input_url: f.input_url, resolved: f.resolved, topics: [topic] }),
      f.resolved ? 'Added. It will be checked within 20 minutes.' : 'Added. The worker will find its feed on its next run.',
    );
    if (ok) {
      setName('');
      setInput('');
    }
  }

  const list = (feeds.data ?? []) as Feed[];
  const ing = status.data as IngestStatus | null;
  const active = list.filter((f) => f.active);
  const pendingBackfill = active.filter((f) => !f.backfilled_at).length;
  const health = (f: Feed) =>
    !f.active ? 'paused' : !f.resolved ? 'finding feed' : f.last_error ? 'error' : f.last_fetched_at ? 'ok' : 'waiting';
  const k = KINDS.find((x) => x.value === kind)!;

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
          <button disabled={busy} onClick={() => run(supabase.rpc('refresh_feeds'), 'The database is fetching every source now. Give it a minute.')}>
            <RssIcon size={16} />
            Fetch now
          </button>
        )}
      </div>
      <p className="hint">
        News feeds, YouTube channels and podcasts. Only the headline, date, link, a short preview and (for videos and
        episodes) length and views are kept, never the full article.
      </p>

      {ing && (
        <div className={`worker-status ${ing.mode}`}>
          <b>{ing.mode === 'worker' ? 'Railway worker is fetching' : 'The database is fetching'}</b>
          <span>
            {ing.worker_last_run_at
              ? `Worker last ran ${formatTimestamp(ing.worker_last_run_at)}${ing.worker_version ? ` (${ing.worker_version})` : ''}.`
              : 'The Railway worker hasn’t run yet.'}{' '}
            {ing.mode === 'database' && 'If the worker stops for an hour, the database takes over automatically.'}
          </span>
          {active.length > 0 && (
            <span>
              {pendingBackfill > 0
                ? `Month backfill: ${active.length - pendingBackfill} of ${active.length} sources done (about a dozen per run).`
                : 'Month backfill: done for every source. New sources get theirs automatically.'}
            </span>
          )}
          {isProducer && pendingBackfill === 0 && active.length > 0 && (
            <button
              className="link"
              disabled={busy}
              onClick={() =>
                confirm('Fetch the last month again for every source? Headlines already stored are not duplicated.') &&
                run(supabase.from('feeds').update({ backfilled_at: null }).eq('active', true), 'The worker will refill the last month over its next few runs.')
              }
            >
              Backfill the last month again
            </button>
          )}
        </div>
      )}

      {isProducer && <WorkerToken activeTokens={ing?.active_tokens ?? 0} onChange={status.reload} />}

      {isProducer && (
        <form className="memory-form" onSubmit={add}>
          <div className="kind-picker" role="radiogroup" aria-label="Kind of source">
            {KINDS.map((x) => (
              <button type="button" key={x.value} role="radio" aria-checked={kind === x.value} className={'chip ' + (kind === x.value ? 'on' : '')} onClick={() => setKind(x.value)}>
                {x.label}
              </button>
            ))}
          </div>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={k.placeholder}
            aria-label="Source"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <p className="hint small">{k.hint}</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name (optional)" aria-label="Display name" />
          <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic">
            {topics.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="actions">
            <button className="primary" disabled={busy || !input.trim()}>
              Add source
            </button>
          </div>
        </form>
      )}
      {msg && <p className={msg.ok ? 'success' : 'error'}>{msg.text}</p>}
      {feeds.error && <p className="error">{feeds.error}</p>}

      <div className="memory-list">
        {list.map((f) => (
          <div key={f.id} className={`memory source-row st-${health(f).replace(' ', '-')}`}>
            <div className="memory-head">
              <span className={`badge src-${health(f).replace(' ', '-')}`}>{health(f)}</span>
              <span className="badge">{KIND_LABEL[f.kind] ?? f.kind}</span>
              {f.active && f.resolved && !f.backfilled_at && <span className="badge">month backfill queued</span>}
              <span className="memory-subject">{f.topics.map((t) => topics.find((x) => x.slug === t)?.name ?? t).join(', ')}</span>
            </div>
            <p className="memory-content">
              <b>{f.name}</b>
            </p>
            <p className="card-meta source-url">
              <span>{f.resolved ? f.url : f.input_url ?? f.url}</span>
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

/** Producer: create the token the Railway worker uses. Shown once; only a hash is stored. */
function WorkerToken({ activeTokens, onChange }: { activeTokens: number; onChange: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const url = import.meta.env.VITE_TRUEADAM_SUPABASE_URL as string;
  const key = import.meta.env.VITE_TRUEADAM_SUPABASE_KEY as string;
  const block = token ? `SUPABASE_URL=${url}\nSUPABASE_KEY=${key}\nINGEST_TOKEN=${token}` : '';

  async function create() {
    if (activeTokens > 0 && !confirm('A worker token already exists. Create another? (Revoke the old one once Railway uses the new one.)')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('create_ingest_token', { label: 'Railway worker' });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setToken(data as string);
    onChange();
  }
  async function revoke() {
    if (!confirm('Revoke every worker token? The Railway worker stops until it gets a new one (the database takes over meanwhile).')) return;
    setBusy(true);
    const { error } = await supabase.rpc('revoke_ingest_tokens');
    setBusy(false);
    if (error) return setErr(errorText(error));
    setToken(null);
    onChange();
  }

  return (
    <div className="research-form worker-token">
      <span className="eyebrow">Railway worker</span>
      {!token ? (
        <>
          <p className="small">
            {activeTokens > 0 ? `${activeTokens} worker token active.` : 'No worker token yet.'} Create one, then paste the three
            lines into Railway → your service → Variables → Raw Editor.
          </p>
          <div className="actions">
            <button className="primary" disabled={busy} onClick={create}>
              Create worker token
            </button>
            {activeTokens > 0 && (
              <button className="danger" disabled={busy} onClick={revoke}>
                Revoke all
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="small">
            Copy this now: the token is shown only once. Paste it into Railway → Variables → Raw Editor, then redeploy.
          </p>
          <pre className="token-block">{block}</pre>
          <div className="actions">
            <button
              className="primary"
              onClick={async () => {
                setCopied(await copyText(block));
                window.setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? 'Copied' : 'Copy all three'}
            </button>
            <button onClick={() => setToken(null)}>Done</button>
          </div>
        </>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
