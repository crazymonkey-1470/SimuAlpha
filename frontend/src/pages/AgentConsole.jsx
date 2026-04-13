import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import supabase from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

const TABS = ['Activity', 'Suggestions'];
const FILTERS = ['All', 'ANALYSIS', 'SCAN', 'LEARNING', 'ERROR', 'SUGGESTION'];

const IMPORTANCE_COLORS = {
  CRITICAL: { bg: 'rgba(239, 68, 68, 0.12)', border: '#ef4444', text: '#f87171' },
  IMPORTANT: { bg: 'rgba(245, 158, 11, 0.10)', border: '#f59e0b', text: '#fbbf24' },
  NOTABLE: { bg: 'rgba(74, 158, 255, 0.08)', border: '#4a9eff', text: '#4a9eff' },
  INFO: { bg: 'rgba(148, 163, 184, 0.06)', border: 'var(--border)', text: 'var(--text-secondary)' },
};

const PRIORITY_COLORS = {
  HIGH: '#ef4444',
  MEDIUM: '#f59e0b',
  LOW: '#4ade80',
};

function timeSince(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AgentConsole() {
  const [tab, setTab] = useState('Activity');

  return (
    <div style={{ paddingTop: '40px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          fontFamily: 'Cormorant Garamond', fontSize: '48px',
          fontWeight: 300, color: 'var(--text-primary)', marginBottom: '8px'
        }}>
          Agent Console
        </h1>
        <p style={{
          fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-secondary)'
        }}>
          Real-time view into what the agent is doing, learning, and suggesting.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'var(--bg-card-hover)' : 'transparent',
            border: `1px solid ${tab === t ? 'var(--border-light)' : 'var(--border)'}`,
            borderRadius: '6px', padding: '8px 20px',
            color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontFamily: 'IBM Plex Mono', fontSize: '12px', cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'Activity' ? (
          <motion.div key="activity" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <ActivityLog />
          </motion.div>
        ) : (
          <motion.div key="suggestions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <SuggestionsPanel />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActivityLog() {
  const [activities, setActivities] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);

  const fetchActivities = useCallback(async () => {
    let query = supabase.from('agent_activity').select('*')
      .order('created_at', { ascending: false }).limit(50);
    if (filter !== 'All') query = query.eq('activity_type', filter);
    const { data } = await query;
    setActivities(data || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(fetchActivities, 30000);
    return () => clearInterval(interval);
  }, [fetchActivities]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'var(--bg-card-hover)' : 'transparent',
            border: `1px solid ${filter === f ? 'var(--border-light)' : 'var(--border)'}`,
            borderRadius: '4px', padding: '4px 12px',
            color: filter === f ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontFamily: 'IBM Plex Mono', fontSize: '10px', cursor: 'pointer',
          }}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : activities.length === 0 ? (
        <EmptyState message="No activity yet" sub="Run an analysis to see events here." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {activities.map(a => {
            const colors = IMPORTANCE_COLORS[a.importance] || IMPORTANCE_COLORS.INFO;
            return (
              <div key={a.id} style={{
                background: colors.bg, border: `1px solid ${colors.border}`,
                borderRadius: '8px', padding: '12px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{
                    background: colors.border, color: '#fff', padding: '1px 6px',
                    borderRadius: '3px', fontSize: '9px', fontWeight: 700,
                    fontFamily: 'IBM Plex Mono', textTransform: 'uppercase',
                  }}>
                    {a.importance}
                  </span>
                  <span style={{
                    color: 'var(--text-secondary)', fontSize: '10px',
                    fontFamily: 'IBM Plex Mono', background: 'var(--bg-card)',
                    padding: '1px 6px', borderRadius: '3px',
                  }}>
                    {a.activity_type}
                  </span>
                  {a.ticker && (
                    <span style={{ color: 'var(--signal-green)', fontSize: '11px', fontFamily: 'IBM Plex Mono', fontWeight: 600 }}>
                      {a.ticker}
                    </span>
                  )}
                  <span style={{ color: '#64748b', fontSize: '10px', fontFamily: 'IBM Plex Mono', marginLeft: 'auto' }}>
                    {timeSince(a.created_at)}
                  </span>
                </div>
                <div style={{ color: colors.text, fontSize: '13px', fontFamily: 'IBM Plex Mono', fontWeight: 500 }}>
                  {a.title}
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '11px', fontFamily: 'IBM Plex Mono', marginTop: '2px' }}>
                  {a.description}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SuggestionsPanel() {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(null);

  async function fetchSuggestions() {
    const { data } = await supabase.from('agent_suggestions').select('*')
      .eq('status', 'PENDING').order('created_at', { ascending: false });
    setSuggestions(data || []);
    setLoading(false);
  }

  useEffect(() => { fetchSuggestions(); }, []);

  async function updateStatus(id, status) {
    await fetch(`/api/agent/suggestions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchSuggestions();
  }

  function copyPrompt(id, prompt) {
    navigator.clipboard.writeText(prompt);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) return <LoadingSpinner />;
  if (suggestions.length === 0) return <EmptyState message="No pending suggestions" sub="The agent generates suggestions weekly during self-improvement analysis." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {suggestions.map(s => (
        <div key={s.id} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '8px', padding: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{
              background: PRIORITY_COLORS[s.priority] || '#64748b', color: '#fff',
              padding: '1px 8px', borderRadius: '3px', fontSize: '9px',
              fontWeight: 700, fontFamily: 'IBM Plex Mono',
            }}>
              {s.priority}
            </span>
            <span style={{
              color: 'var(--text-secondary)', fontSize: '10px', fontFamily: 'IBM Plex Mono',
              background: 'rgba(148, 163, 184, 0.1)', padding: '1px 6px', borderRadius: '3px',
            }}>
              {s.suggestion_type}
            </span>
            <span style={{ color: '#64748b', fontSize: '10px', fontFamily: 'IBM Plex Mono', marginLeft: 'auto' }}>
              {timeSince(s.created_at)}
            </span>
          </div>

          <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'IBM Plex Mono', fontWeight: 500, marginBottom: '4px' }}>
            {s.title}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontFamily: 'IBM Plex Mono', marginBottom: '8px', lineHeight: 1.5 }}>
            {s.description}
          </div>

          {s.evidence && (
            <div style={{
              color: '#64748b', fontSize: '11px', fontFamily: 'IBM Plex Mono',
              marginBottom: '8px', fontStyle: 'italic',
            }}>
              Evidence: {s.evidence}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            {s.claude_code_prompt && (
              <button onClick={() => copyPrompt(s.id, s.claude_code_prompt)} style={{
                background: 'rgba(74, 158, 255, 0.1)', border: '1px solid rgba(74, 158, 255, 0.3)',
                borderRadius: '4px', padding: '4px 12px', cursor: 'pointer',
                color: '#4a9eff', fontSize: '11px', fontFamily: 'IBM Plex Mono',
              }}>
                {copied === s.id ? 'Copied!' : 'Copy Prompt'}
              </button>
            )}
            <button onClick={() => updateStatus(s.id, 'APPROVED')} style={{
              background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '4px', padding: '4px 12px', cursor: 'pointer',
              color: '#4ade80', fontSize: '11px', fontFamily: 'IBM Plex Mono',
            }}>
              Approve
            </button>
            <button onClick={() => updateStatus(s.id, 'REJECTED')} style={{
              background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '4px', padding: '4px 12px', cursor: 'pointer',
              color: '#f87171', fontSize: '11px', fontFamily: 'IBM Plex Mono',
            }}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
