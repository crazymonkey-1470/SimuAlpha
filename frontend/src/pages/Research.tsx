import { useState } from 'react';
import { supabase } from '../supabase';
import { useLoad } from '../lib';
import type { MemoryCard, ResearchRequest, ResearchStatus } from '../types';
import { MemoryForm, MemoryRow } from '../components/Memory';
import { RESEARCH_SELECT, ResearchCard, ResearchForm } from '../components/Research';
import GrokDesk from '../components/GrokDesk';

const TABS: { key: string; label: string; statuses: ResearchStatus[] | null }[] = [
  { key: 'desk', label: 'Run Grok', statuses: null },
  { key: 'open', label: 'Open', statuses: ['open', 'in_progress'] },
  { key: 'done', label: 'Answered', statuses: ['done'] },
  { key: 'all', label: 'All', statuses: null },
  { key: 'memory', label: 'Memory', statuses: null },
];

export default function Research() {
  const [tab, setTab] = useState('open');
  const [asking, setAsking] = useState(false);
  const statuses = TABS.find((t) => t.key === tab)!.statuses;

  const res = useLoad(() => {
    if (tab === 'memory' || tab === 'desk') return Promise.resolve({ data: [], error: null });
    let q = supabase.from('research_requests').select(RESEARCH_SELECT);
    if (statuses) q = q.in('status', statuses);
    return q.order(tab === 'done' ? 'answered_at' : 'created_at', { ascending: false }).limit(200);
  }, [tab]);
  const list = (res.data ?? []) as ResearchRequest[];
  const special = tab === 'memory' || tab === 'desk';

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
        article. <b>Run Grok</b> does the daily run without the database editor.
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

      {tab === 'memory' && <MemoryTab />}
      {tab === 'desk' && <GrokDesk />}
      {!special && res.error && <p className="error">{res.error}</p>}
      {!special && res.loading && !res.data && <p className="muted">Loading…</p>}
      {!special && res.data && list.length === 0 && (
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

function MemoryTab() {
  const [q, setQ] = useState('');
  const mem = useLoad(
    () =>
      supabase
        .from('memory_cards')
        .select('*')
        .is('invalid_at', null)
        .order('pinned', { ascending: false })
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300),
    [],
  );
  const term = q.trim().toLowerCase();
  const list = ((mem.data ?? []) as MemoryCard[]).filter(
    (m) => !term || `${m.content} ${m.subject} ${m.tags.join(' ')}`.toLowerCase().includes(term),
  );
  return (
    <>
      <p className="hint">
        Grok’s long-term memory about the show: standing instructions, facts, what’s been covered. It checks this
        before every answer. Personal notes live on each person’s Account page.
      </p>
      <MemoryForm onDone={mem.reload} />
      <input type="search" className="filter" placeholder="Search memory…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search memory" />
      {mem.error && <p className="error">{mem.error}</p>}
      {mem.data && list.length === 0 && <p className="empty">{term ? 'No matches.' : 'Grok hasn’t remembered anything yet.'}</p>}
      <div className="memory-list">
        {list.map((m) => (
          <MemoryRow key={m.id} m={m} onChange={mem.reload} />
        ))}
      </div>
    </>
  );
}
