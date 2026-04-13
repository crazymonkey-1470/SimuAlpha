import { useState, useEffect } from 'react';
import { useToast } from './Toast';

const METRICS = [
  { key: 'total_score', label: 'Total Score' },
  { key: 'pct_from_200wma', label: '% from 200WMA' },
  { key: 'current_price', label: 'Price' },
  { key: 'signal', label: 'Signal' },
  { key: 'fundamental_score', label: 'Fundamental Score' },
  { key: 'technical_score', label: 'Technical Score' },
];

const CONDITIONS = [
  { key: 'above', label: 'Above' },
  { key: 'below', label: 'Below' },
  { key: 'equals', label: 'Equals' },
];

export default function AlertConfig({ ticker }) {
  const { success } = useToast();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [metric, setMetric] = useState('total_score');
  const [condition, setCondition] = useState('above');
  const [threshold, setThreshold] = useState('');
  const [telegram, setTelegram] = useState(false);

  async function fetchAlerts() {
    try {
      const res = await fetch(`/api/alerts?ticker=${ticker}`);
      const json = await res.json();
      setAlerts(json.alerts || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchAlerts(); }, [ticker]);

  async function handleCreate() {
    if (!threshold.trim()) return;
    await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, metric, condition, threshold, telegram }),
    });
    setThreshold('');
    setShowForm(false);
    success(`Alert created for ${ticker}`);
    fetchAlerts();
  }

  async function handleDelete(id) {
    await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
    fetchAlerts();
  }

  async function handleToggle(id) {
    await fetch(`/api/alerts/${id}/toggle`, { method: 'PATCH' });
    fetchAlerts();
  }

  const inputStyle = {
    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: '4px', padding: '6px 10px', color: 'var(--text-primary)',
    fontFamily: 'IBM Plex Mono', fontSize: '11px', outline: 'none',
  };

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: '10px', padding: '20px 24px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{
          fontFamily: 'Cormorant Garamond', fontSize: '20px', fontWeight: 500,
          color: 'var(--text-primary)'
        }}>
          Custom Alerts
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            background: 'var(--signal-green-dim)', border: '1px solid var(--signal-green)40',
            borderRadius: '4px', padding: '4px 12px', color: 'var(--signal-green)',
            fontFamily: 'IBM Plex Mono', fontSize: '10px', cursor: 'pointer',
          }}
        >
          {showForm ? 'Cancel' : '+ New Alert'}
        </button>
      </div>

      {showForm && (
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center',
          padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px',
          border: '1px solid var(--border)'
        }}>
          <select value={metric} onChange={e => setMetric(e.target.value)} style={inputStyle}>
            {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <select value={condition} onChange={e => setCondition(e.target.value)} style={inputStyle}>
            {CONDITIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input
            value={threshold}
            onChange={e => setThreshold(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Value"
            style={{ ...inputStyle, width: '80px' }}
          />
          <label style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox" checked={telegram}
              onChange={e => setTelegram(e.target.checked)}
              style={{ accentColor: 'var(--signal-green)' }}
            />
            Telegram
          </label>
          <button
            onClick={handleCreate}
            style={{
              background: 'var(--signal-green)', border: 'none', borderRadius: '4px',
              padding: '6px 14px', color: '#0c0c0e', fontFamily: 'IBM Plex Mono',
              fontSize: '10px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Create
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)' }}>Loading...</div>
      ) : alerts.length === 0 ? (
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-dim)' }}>
          No alerts configured. Create one to get notified.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {alerts.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 12px', background: 'var(--bg-secondary)',
              borderRadius: '6px', border: '1px solid var(--border)',
              opacity: a.active ? 1 : 0.5,
            }}>
              <span style={{
                fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-primary)', flex: 1
              }}>
                {METRICS.find(m => m.key === a.metric)?.label || a.metric}
                {' '}<span style={{ color: 'var(--signal-amber)' }}>{a.condition}</span>{' '}
                <strong>{a.threshold}</strong>
                {a.telegram && <span style={{ color: 'var(--text-dim)', marginLeft: '6px' }}>[TG]</span>}
              </span>
              {a.last_fired && (
                <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-dim)' }}>
                  Fired: {new Date(a.last_fired).toLocaleDateString()}
                </span>
              )}
              <button
                onClick={() => handleToggle(a.id)}
                style={{
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: '3px', padding: '2px 8px', color: 'var(--text-dim)',
                  fontFamily: 'IBM Plex Mono', fontSize: '9px', cursor: 'pointer',
                }}
              >
                {a.active ? 'Pause' : 'Resume'}
              </button>
              <button
                onClick={() => handleDelete(a.id)}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-dim)',
                  cursor: 'pointer', fontFamily: 'IBM Plex Mono', fontSize: '14px', padding: '0 4px',
                }}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
