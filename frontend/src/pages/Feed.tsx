import { useState } from 'react';
import { supabase } from '../supabase';
import { href, useApp, useLoad } from '../lib';
import type { SourceStory } from '../types';
import StoryCard from '../components/StoryCard';
import Picks from './Picks';

const SEGMENTS = [
  { key: 'fresh', label: 'Fresh' },
  { key: 'starred', label: 'Starred' },
  { key: 'pitches', label: 'Pitches' },
] as const;
type Segment = (typeof SEGMENTS)[number]['key'];

export default function Feed({ initial = 'fresh' }: { initial?: Segment }) {
  const [seg, setSeg] = useState<Segment>(initial);
  return (
    <>
      <div className="page-head">
        <h1>
          The <em>feed</em>
        </h1>
        <a className="button" href={href('sources')}>
          Sources
        </a>
      </div>
      <div className="segmented" role="tablist">
        {SEGMENTS.map((s) => (
          <button key={s.key} role="tab" aria-selected={seg === s.key} className={seg === s.key ? 'on' : ''} onClick={() => setSeg(s.key)}>
            {s.label}
          </button>
        ))}
      </div>
      {seg === 'fresh' && <Fresh />}
      {seg === 'starred' && <Picks embedded show="stars" />}
      {seg === 'pitches' && <Picks embedded show="pitches" />}
    </>
  );
}

const PAGE = 120;
const WINDOWS = [
  { days: 1, label: 'Last 24 hours' },
  { days: 7, label: 'Last 7 days' },
  { days: 31, label: 'Last month' },
];

function Fresh() {
  const { topics } = useApp();
  const [topic, setTopic] = useState('');
  const [days, setDays] = useState(7);
  const [limit, setLimit] = useState(PAGE);
  const [showHidden, setShowHidden] = useState(false);
  const res = useLoad(() => {
    let q = supabase
      .from('source_inbox')
      .select('*')
      .gt('latest_at', new Date(Date.now() - days * 86_400_000).toISOString());
    // Over a week or a month there are thousands of stories: fetch the most-covered first, so the window
    // means something (the newest 120 alone would only reach back a few hours).
    q = (days > 1 ? q.order('outlet_count', { ascending: false }) : q).order('latest_at', { ascending: false }).limit(limit);
    if (topic) q = q.contains('topics', [topic]);
    return q;
  }, [topic, days, limit]);

  const all = (res.data ?? []) as SourceStory[];
  // Strongest first: several outlets, crew votes, then recency. In-prep stories sink.
  const score = (s: SourceStory) =>
    (s.outlet_count - 1) * 2 + s.discuss_count * 3 + s.more_count - s.not_count * 3 - (s.in_prep ? 4 : 0) +
    Math.max(0, 2 - (Date.now() - new Date(s.latest_at).getTime()) / 86_400_000);
  const visible = all
    .filter((s) => showHidden || !s.my_feedback.includes('not_interested'))
    .sort((a, b) => score(b) - score(a));
  const hidden = all.length - all.filter((s) => !s.my_feedback.includes('not_interested')).length;

  return (
    <>
      <p className="hint">
        Headlines from trusted sources, refreshed every 20 minutes, filed by topic. The same story from several outlets
        shows once.
        Tap <b>Discuss this</b> to send it to the prep room.
      </p>
      <div className="feed-filters">
        <select
          value={days}
          onChange={(e) => {
            setDays(Number(e.target.value));
            setLimit(PAGE);
          }}
          aria-label="How far back"
        >
          {WINDOWS.map((w) => (
            <option key={w.days} value={w.days}>
              {w.label}
            </option>
          ))}
        </select>
        <select
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            setLimit(PAGE);
          }}
          aria-label="Topic"
        >
          <option value="">All topics</option>
          {topics.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
        {hidden > 0 && (
          <label className="check">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
            Show {hidden} hidden
          </label>
        )}
      </div>
      {res.error && <p className="error">{res.error}</p>}
      {res.loading && !res.data && <p className="muted">Loading…</p>}
      {res.data && visible.length === 0 && (
        <p className="empty">Nothing new from the sources yet. They refresh every 20 minutes.</p>
      )}
      <div className="list">
        {visible.map((s) => (
          <StoryCard key={s.story_id} s={s} onChange={res.reload} />
        ))}
      </div>
      {all.length >= limit && (
        <div className="actions more">
          <button disabled={res.loading} onClick={() => setLimit(limit + PAGE)}>
            {res.loading ? 'Loading…' : 'Show more'}
          </button>
        </div>
      )}
    </>
  );
}
