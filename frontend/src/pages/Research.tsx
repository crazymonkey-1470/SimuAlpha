import { useState } from 'react';
import { supabase } from '../supabase';
import { useLoad } from '../lib';
import type { ResearchRequest, ResearchStatus } from '../types';
import { RESEARCH_SELECT, ResearchCard, ResearchForm } from '../components/Research';

const TABS: { key: string; label: string; statuses: ResearchStatus[] | null }[] = [
  { key: 'open', label: 'Open', statuses: ['open', 'in_progress'] },
  { key: 'done', label: 'Answered', statuses: ['done'] },
  { key: 'all', label: 'All', statuses: null },
];

export default function Research() {
  const [tab, setTab] = useState('open');
  const [asking, setAsking] = useState(false);
  const statuses = TABS.find((t) => t.key === tab)!.statuses;

  const res = useLoad(() => {
    let q = supabase.from('research_requests').select(RESEARCH_SELECT);
    if (statuses) q = q.in('status', statuses);
    return q.order(tab === 'done' ? 'answered_at' : 'created_at', { ascending: false }).limit(200);
  }, [tab]);
  const list = (res.data ?? []) as ResearchRequest[];

  return (
    <>
      <div className="page-head">
        <h1>
          Grok <em>research</em>
        </h1>
        {!asking && (
          <button className="primary" onClick={() => setAsking(true)}>
            + Ask
          </button>
        )}
      </div>
      <p className="hint">
        Leave Grok a job: deeper research, stats, fact checks, counterpoints. Answers show up here and on the
        article.
      </p>

      {asking && (
        <ResearchForm
          onDone={() => {
            setAsking(false);
            setTab('open');
            res.reload();
          }}
          onCancel={() => setAsking(false)}
        />
      )}

      <div className="segmented" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === tab} className={t.key === tab ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {res.error && <p className="error">{res.error}</p>}
      {res.loading && !res.data && <p className="muted">Loading…</p>}
      {res.data && list.length === 0 && (
        <p className="empty">{tab === 'open' ? 'Nothing waiting on Grok.' : 'Nothing here yet.'}</p>
      )}
      <div className="list">
        {list.map((r) => (
          <ResearchCard key={r.id} r={r} onChange={res.reload} />
        ))}
      </div>
    </>
  );
}
