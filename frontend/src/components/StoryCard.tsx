import { useState } from 'react';
import { errorText, supabase } from '../supabase';
import { formatDay, freshness, href, useApp } from '../lib';
import type { FeedbackKind, SourceStory } from '../types';
import { CommentIcon, ExternalIcon, MoreLikeIcon, XIcon } from './Icons';

/** One story from the source inbox, with Discuss / More like this / Not interested. */
export default function StoryCard({ s, onChange }: { s: SourceStory; onChange: () => void }) {
  const { topics } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [asking, setAsking] = useState<FeedbackKind | null>(null);
  const [reason, setReason] = useState('');
  const mine = (k: FeedbackKind) => s.my_feedback.includes(k);
  const others = s.outlets.filter((o) => o !== s.source);

  async function run(op: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setErr('');
    const { error } = await op;
    setBusy(false);
    if (error) return setErr(errorText(error));
    setAsking(null);
    setReason('');
    onChange();
  }

  const toggle = (kind: FeedbackKind, why?: string) =>
    run(supabase.rpc('set_feedback', { entry_id: s.entry_id, kind, turn_on: !mine(kind), reason: why ?? null }));
  const discuss = (why?: string) => run(supabase.rpc('discuss_entry', { entry_id: s.entry_id, reason: why ?? null }));

  const date = s.published_at ?? s.latest_at;
  const minutes = s.duration_seconds ? Math.round(s.duration_seconds / 60) : null;
  const views = s.views != null ? new Intl.NumberFormat('en', { notation: 'compact' }).format(s.views) : null;
  return (
    <article className={`card story ${mine('not_interested') ? 'dismissed' : ''}`}>
      {s.media_type === 'video' && s.thumbnail_url && (
        <a className="story-thumb" href={s.url} target="_blank" rel="noopener noreferrer" aria-hidden="true" tabIndex={-1}>
          <img src={s.thumbnail_url} alt="" loading="lazy" decoding="async" />
        </a>
      )}
      <div className="card-top">
        {s.media_type === 'video' && <span className="badge type-video">Video</span>}
        {s.media_type === 'podcast' && <span className="badge type-guest_idea">Podcast</span>}
        {s.in_prep && <span className="badge st-this_week">In the prep room</span>}
        {s.read && <span className="badge type-fun_fact">Read by Grok</span>}
        {s.outlet_count > 1 && <span className="badge">{s.outlet_count} outlets</span>}
      </div>
      <h3 className="card-title story-title">
        <a href={s.url} target="_blank" rel="noopener noreferrer">
          {s.title}{' '}
          <span className="ext" aria-hidden="true">
            <ExternalIcon size={16} />
          </span>
        </a>
      </h3>
      <p className="card-meta">
        <b>{s.source}</b>
        <span>
          {formatDay(date.slice(0, 10))} <em>({freshness(date.slice(0, 10))})</em>
        </span>
        {others.length > 0 && <span>also: {others.join(', ')}</span>}
        {minutes != null && <span>{minutes} min</span>}
        {views && <span>{views} views</span>}
        {s.media_type === 'podcast' && s.media_url && (
          <a href={s.media_url} target="_blank" rel="noopener noreferrer">
            Listen
          </a>
        )}
        {s.transcript_url && (
          <a href={s.transcript_url} target="_blank" rel="noopener noreferrer">
            Transcript
          </a>
        )}
      </p>
      {s.preview && <p className="story-preview">{s.preview}</p>}
      {s.read_summary && (
        <div className="answer story-read">
          <h4>Grok’s read</h4>
          <p>{s.read_summary}</p>
        </div>
      )}
      {(s.topics.length > 0 || s.discuss_count + s.more_count + s.not_count > 0) && (
        <div className="chips">
          {s.topics.map((slug) => (
            <a key={slug} className="chip" href={href('t', slug)}>
              {topics.find((t) => t.slug === slug)?.name ?? slug}
            </a>
          ))}
          {s.discuss_count > 0 && <span className="chip votes">{s.discuss_count} want to discuss</span>}
          {s.more_count > 0 && <span className="chip votes">{s.more_count} more like this</span>}
          {s.not_count > 0 && <span className="chip votes">{s.not_count} not interested</span>}
        </div>
      )}
      <div className="actions">
        {s.in_prep && s.item_id ? (
          <a className="button" href={href('i', s.item_id)}>
            <CommentIcon size={16} />
            Open in prep room
          </a>
        ) : (
          <button className="primary" disabled={busy} onClick={() => discuss()}>
            <CommentIcon size={16} />
            Discuss this
          </button>
        )}
        <button className={mine('more_like_this') ? 'on' : ''} disabled={busy} onClick={() => toggle('more_like_this')} aria-pressed={mine('more_like_this')}>
          <MoreLikeIcon size={16} />
          More like this
        </button>
        <button
          className={mine('not_interested') ? 'on' : ''}
          disabled={busy}
          aria-pressed={mine('not_interested')}
          onClick={() => (mine('not_interested') ? toggle('not_interested') : setAsking(asking ? null : 'not_interested'))}
        >
          <XIcon size={16} />
          Not interested
        </button>
      </div>
      {asking === 'not_interested' && (
        <form
          className="reason-form"
          onSubmit={(e) => {
            e.preventDefault();
            toggle('not_interested', reason.trim() || undefined);
          }}
        >
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why? (optional: helps Grok pick better)"
            aria-label="Reason"
            autoFocus
          />
          <div className="actions">
            <button className="primary" disabled={busy}>
              Hide it
            </button>
            <button type="button" onClick={() => setAsking(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {err && <p className="error">{err}</p>}
    </article>
  );
}
