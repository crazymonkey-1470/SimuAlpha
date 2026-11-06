import { useState } from 'react';
import { errorText, supabase } from '../supabase';
import { formatDay, freshness, href, useApp } from '../lib';
import { CONTACT_LABEL, ITEM_TYPES, STATUS_LABEL, type ContactStatus, type ItemCard, type ItemStatus } from '../types';
import Comments from './Comments';
import { ResearchForm } from './Research';

interface Props {
  item: ItemCard;
  onChange: () => void;
  /** When shown on an episode page: offer "Detach". */
  episodeId?: string;
  openComments?: boolean;
}

export default function ItemCardView({ item, onChange, episodeId, openComments = false }: Props) {
  const { me, topics, episodes, profiles } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showComments, setShowComments] = useState(openComments);
  const [asking, setAsking] = useState(false);

  const starred = item.highlighted_by.includes(me.id);
  const starNames = item.highlighted_by.map((id) => (id === me.id ? 'You' : profiles.get(id)?.display_name ?? '?'));

  const canEdit = me.role === 'producer' || item.added_by === me.id;
  const typeLabel = ITEM_TYPES.find((t) => t.value === item.item_type)?.label ?? item.item_type;
  const attached = episodes.filter((e) => item.episode_ids.includes(e.id));
  const attachable = episodes.filter((e) => e.status === 'planning' && !item.episode_ids.includes(e.id));

  async function run(op: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setErr('');
    const { error } = await op;
    setBusy(false);
    if (error) setErr(errorText(error));
    else onChange();
  }

  const setStatus = (status: ItemStatus) => run(supabase.from('items').update({ status }).eq('id', item.id));
  const setContact = (contact_status: ContactStatus) =>
    run(supabase.from('items').update({ contact_status }).eq('id', item.id));
  const attach = (episode_id: string) => run(supabase.from('item_episodes').insert({ item_id: item.id, episode_id }));
  const detach = () =>
    run(supabase.from('item_episodes').delete().eq('item_id', item.id).eq('episode_id', episodeId!));
  const toggleStar = () =>
    run(
      starred
        ? supabase.from('item_highlights').delete().eq('item_id', item.id).eq('user_id', me.id)
        : supabase.from('item_highlights').insert({ item_id: item.id }),
    );

  return (
    <article className={`card status-${item.status} type-${item.item_type}`}>
      <div className="card-top">
        <span className={`badge type-${item.item_type}`}>{typeLabel}</span>
        {item.status !== 'inbox' && <span className={`badge st-${item.status}`}>{STATUS_LABEL[item.status]}</span>}
      </div>

      <h3 className="card-title">
        {item.url ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            {item.title} <span aria-hidden>↗</span>
          </a>
        ) : (
          item.title
        )}
      </h3>

      <p className="card-meta">
        {item.source && <b>{item.source}</b>}
        {item.published_at && (
          <span title={item.published_at}>
            {formatDay(item.published_at)} <em>({freshness(item.published_at)})</em>
          </span>
        )}
        <span>
          added by {item.added_by_name} · <a href={href('i', item.id)}>link</a>
        </span>
      </p>

      {item.item_type === 'guest_idea' && (item.guest_name || item.why_them || item.contact_status) && (
        <div className="guest">
          {item.guest_name && <div className="guest-name">{item.guest_name}</div>}
          {item.why_them && <p>{item.why_them}</p>}
          <label>
            Contact:{' '}
            <select
              value={item.contact_status ?? ''}
              disabled={busy}
              onChange={(e) => setContact(e.target.value as ContactStatus)}
            >
              {!item.contact_status && <option value="">—</option>}
              {Object.entries(CONTACT_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {item.summary && <p className="summary">{item.summary}</p>}

      {item.talking_points.length > 0 && (
        <div className="points">
          <h4>Talking points</h4>
          <ul>
            {item.talking_points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {item.quote && <blockquote>“{item.quote}”</blockquote>}

      {(item.highlight_count > 0 || item.research_open + item.research_done > 0) && (
        <div className="signals">
          {item.highlight_count > 0 && <span className="stars">★ {starNames.join(', ')}</span>}
          {item.research_open + item.research_done > 0 && (
            <a className="research-signal" href={href('i', item.id)}>
              🔎 {[item.research_open && `${item.research_open} open`, item.research_done && `${item.research_done} answered`]
                .filter(Boolean)
                .join(' · ')}
            </a>
          )}
        </div>
      )}

      {(item.topics.length > 0 || attached.length > 0) && (
        <div className="chips">
          {item.topics.map((slug) => (
            <a key={slug} className="chip" href={href('t', slug)}>
              {topics.find((t) => t.slug === slug)?.name ?? slug}
            </a>
          ))}
          {attached.map((e) => (
            <a key={e.id} className="chip episode" href={href('e', e.id)}>
              🎙 {e.title}
            </a>
          ))}
        </div>
      )}

      <div className="actions">
        {item.status === 'inbox' && (
          <button className="primary" disabled={busy} onClick={() => setStatus('this_week')}>
            📌 This week
          </button>
        )}
        {item.status !== 'inbox' && (
          <button disabled={busy} onClick={() => setStatus('inbox')}>
            ↩ Inbox
          </button>
        )}
        {item.status !== 'used' && (
          <button disabled={busy} onClick={() => setStatus('used')}>
            ✓ Used
          </button>
        )}
        {item.status !== 'archived' && (
          <button disabled={busy} onClick={() => setStatus('archived')}>
            Archive
          </button>
        )}
        <button
          className={'star ' + (starred ? 'starred' : '')}
          disabled={busy}
          onClick={toggleStar}
          aria-pressed={starred}
          aria-label={starred ? 'Remove your star' : 'Star this'}
        >
          {starred ? '★' : '☆'} {item.highlight_count || 'Star'}
        </button>
        <button className={showComments ? 'on' : ''} onClick={() => setShowComments((s) => !s)} aria-label="Comments">
          💬 {item.comment_count}
        </button>
        <button className={asking ? 'on' : ''} onClick={() => setAsking((a) => !a)}>
          🔎 Grok
        </button>
        {attachable.length > 0 && (
          <select
            className="attach"
            value=""
            disabled={busy}
            onChange={(e) => e.target.value && attach(e.target.value)}
            aria-label="Add to episode"
          >
            <option value="">+ Episode…</option>
            {attachable.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
                {e.recording_date ? ` (${formatDay(e.recording_date)})` : ''}
              </option>
            ))}
          </select>
        )}
        {episodeId && (
          <button disabled={busy} onClick={detach}>
            Detach
          </button>
        )}
        {canEdit && (
          <a className="button" href={href('edit', item.id)}>
            Edit
          </a>
        )}
      </div>

      {err && <p className="error">{err}</p>}
      {asking && (
        <ResearchForm
          item={item}
          onDone={() => {
            setAsking(false);
            onChange();
          }}
          onCancel={() => setAsking(false)}
        />
      )}
      {showComments && <Comments itemId={item.id} onCountChange={onChange} />}
    </article>
  );
}
