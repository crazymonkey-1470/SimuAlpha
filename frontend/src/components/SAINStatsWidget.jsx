import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useSAINStats } from '../hooks/useSAIN';

export default function SAINStatsWidget() {
  const navigate = useNavigate();
  const { stats, loading } = useSAINStats();

  if (loading) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '24px', minWidth: '280px'
      }}>
        <div style={{
          width: '24px', height: '24px', margin: '0 auto',
          border: '2px solid var(--border)', borderTop: '2px solid var(--blue)',
          borderRadius: '50%', animation: 'spin 1s linear infinite'
        }} />
      </div>
    );
  }

  if (!stats) return null;

  const lastScanStr = stats.lastScan
    ? formatTimeAgo(new Date(stats.lastScan))
    : 'No scans yet';

  const rows = [
    { label: 'Sources active', value: `${stats.sourcesActive}` },
    { label: 'Signals (24h)', value: stats.signals24h.toString(), highlight: stats.signals24h > 0 },
    { label: 'Politicians', value: `${stats.politicians24h} trades` },
    { label: 'AI Models', value: `${stats.aiModels24h} signals` },
    { label: 'Insiders', value: `${stats.insiders24h} trades` },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '10px', padding: '20px 24px'
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'
      }}>
        <span style={{ fontSize: '14px' }}>&#128225;</span>
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '12px', fontWeight: 500,
          color: 'var(--text-primary)', letterSpacing: '0.05em'
        }}>
          SAIN NETWORK STATUS
        </span>
      </div>

      <div style={{
        fontFamily: 'IBM Plex Mono', fontSize: '11px',
        color: 'var(--text-dim)', marginBottom: '14px'
      }}>
        Last scan: {lastScanStr}
      </div>

      <div style={{
        height: '1px', background: 'var(--border)',
        marginBottom: '12px'
      }} />

      {rows.map(row => (
        <div key={row.label} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '4px 0'
        }}>
          <span style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px',
            color: 'var(--text-secondary)'
          }}>
            {row.label}
          </span>
          <span style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 500,
            color: row.highlight ? 'var(--signal-green)' : 'var(--text-primary)'
          }}>
            {row.value}
          </span>
        </div>
      ))}

      <div style={{
        height: '1px', background: 'var(--border)',
        margin: '12px 0'
      }} />

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '4px 0', marginBottom: '14px'
      }}>
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '11px',
          color: 'var(--text-secondary)'
        }}>
          Full Stack Consensus
        </span>
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 500,
          color: stats.fullStackCount > 0 ? 'var(--gold)' : 'var(--text-primary)'
        }}>
          {stats.fullStackCount} stock{stats.fullStackCount !== 1 ? 's' : ''}
        </span>
      </div>

      <button
        onClick={() => navigate('/intelligence')}
        style={{
          width: '100%', background: 'var(--bg-secondary)',
          border: '1px solid var(--border)', borderRadius: '6px',
          padding: '8px', fontFamily: 'IBM Plex Mono', fontSize: '11px',
          color: 'var(--blue)', cursor: 'pointer', transition: 'all 0.15s ease'
        }}
      >
        View Feed &rarr;
      </button>
    </motion.div>
  );
}

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs !== 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
}
