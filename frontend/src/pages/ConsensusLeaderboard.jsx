import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useConsensusLeaderboard } from '../hooks/useSAIN';
import LoadingSpinner from '../components/LoadingSpinner';

const COLUMNS = [
  { key: 'rank', label: 'Rank', sortable: false },
  { key: 'ticker', label: 'Ticker', sortable: false },
  { key: 'total_sain_score', label: 'Total', sortable: true },
  { key: 'super_investor_score', label: 'Super', sortable: true },
  { key: 'politician_score', label: 'Pol', sortable: true },
  { key: 'ai_model_score', label: 'AI', sortable: true },
  { key: 'tli_score', label: 'TLI', sortable: true },
  { key: 'layers_aligned', label: 'Layers', sortable: true },
  { key: 'consensus_direction', label: 'Dir', sortable: false },
];

const DIR_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'BUY', label: 'BUY Only' },
  { key: 'SELL', label: 'SELL Only' },
];

export default function ConsensusLeaderboard() {
  const navigate = useNavigate();
  const { data, loading } = useConsensusLeaderboard();
  const [sortKey, setSortKey] = useState('total_sain_score');
  const [sortAsc, setSortAsc] = useState(false);
  const [dirFilter, setDirFilter] = useState('ALL');

  if (loading) {
    return (
      <div style={{ paddingTop: '40px' }}>
        <LoadingSpinner />
      </div>
    );
  }

  // Filter
  let filtered = data;
  if (dirFilter === 'BUY') {
    filtered = data.filter(r => r.consensus_direction?.includes('BUY'));
  } else if (dirFilter === 'SELL') {
    filtered = data.filter(r => r.consensus_direction?.includes('SELL'));
  }

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortKey] ?? 0;
    const bVal = b[sortKey] ?? 0;
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  function handleSort(key) {
    if (!COLUMNS.find(c => c.key === key)?.sortable) return;
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const cellBase = {
    fontFamily: 'IBM Plex Mono', fontSize: '12px',
    padding: '10px 14px', borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap'
  };

  return (
    <div style={{ paddingTop: '40px' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: '32px' }}
      >
        <h1 style={{
          fontFamily: 'Cormorant Garamond', fontSize: '48px',
          fontWeight: 300, color: 'var(--text-primary)',
          lineHeight: 1, marginBottom: '8px'
        }}>
          SAIN Consensus <span style={{ color: 'var(--gold)', fontStyle: 'italic' }}>Leaderboard</span>
        </h1>
        <p style={{
          fontFamily: 'IBM Plex Mono', fontSize: '12px',
          color: 'var(--text-secondary)', lineHeight: 1.6
        }}>
          All stocks ranked by 4-layer SAIN consensus score. Click any row for full analysis.
        </p>
      </motion.div>

      {/* Direction filter */}
      <div style={{
        display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap'
      }}>
        {DIR_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setDirFilter(f.key)}
            style={{
              fontFamily: 'IBM Plex Mono', fontSize: '11px',
              padding: '6px 14px', borderRadius: '6px',
              border: dirFilter === f.key ? '1px solid var(--border-light)' : '1px solid transparent',
              background: dirFilter === f.key ? 'var(--bg-card)' : 'transparent',
              color: dirFilter === f.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 0.15s ease'
            }}
          >
            {f.label}
          </button>
        ))}
        <span style={{
          fontFamily: 'IBM Plex Mono', fontSize: '11px',
          color: 'var(--text-dim)', alignSelf: 'center', marginLeft: '8px'
        }}>
          {sorted.length} stock{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Empty state */}
      {sorted.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '48px', textAlign: 'center'
        }}>
          <div style={{
            fontFamily: 'Cormorant Garamond', fontSize: '20px',
            color: 'var(--text-secondary)', marginBottom: '8px'
          }}>
            No consensus data available
          </div>
          <div style={{
            fontFamily: 'IBM Plex Mono', fontSize: '11px',
            color: 'var(--text-dim)', lineHeight: 1.7
          }}>
            SAIN consensus scores are computed after signals are collected.
            Check back after the next scan cycle.
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '10px', overflow: 'hidden'
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{
                        ...cellBase, fontSize: '10px',
                        color: sortKey === col.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                        textAlign: col.key === 'ticker' ? 'left' : 'center',
                        cursor: col.sortable ? 'pointer' : 'default',
                        background: 'var(--bg-secondary)', fontWeight: 500,
                        userSelect: 'none'
                      }}
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span style={{ marginLeft: '4px', fontSize: '9px' }}>
                          {sortAsc ? '\u25B2' : '\u25BC'}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, idx) => {
                  const dirLabel = row.consensus_direction || '\u2014';
                  const dirColor = dirLabel.includes('BUY') ? 'var(--signal-green)'
                    : dirLabel.includes('SELL') ? 'var(--red)' : 'var(--signal-amber)';

                  return (
                    <tr
                      key={row.ticker}
                      onClick={() => navigate(`/ticker/${row.ticker}`)}
                      style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Rank */}
                      <td style={{ ...cellBase, textAlign: 'center', color: 'var(--text-dim)' }}>
                        {idx + 1}
                      </td>

                      {/* Ticker */}
                      <td style={{ ...cellBase, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {row.is_full_stack_consensus && (
                          <span style={{ marginRight: '6px' }}>&#127942;</span>
                        )}
                        {row.ticker}
                      </td>

                      {/* Total */}
                      <td style={{
                        ...cellBase, textAlign: 'center', fontWeight: 600,
                        color: row.total_sain_score > 0 ? 'var(--signal-green)'
                          : row.total_sain_score < 0 ? 'var(--red)' : 'var(--text-secondary)'
                      }}>
                        {row.total_sain_score > 0 ? '+' : ''}{row.total_sain_score}
                      </td>

                      {/* Layer scores */}
                      {['super_investor_score', 'politician_score', 'ai_model_score', 'tli_score'].map(k => {
                        const v = row[k] ?? 0;
                        return (
                          <td key={k} style={{
                            ...cellBase, textAlign: 'center',
                            color: v > 0 ? 'var(--signal-green)'
                              : v < 0 ? 'var(--red)' : 'var(--text-dim)'
                          }}>
                            {v > 0 ? '+' : ''}{v}
                          </td>
                        );
                      })}

                      {/* Layers aligned */}
                      <td style={{
                        ...cellBase, textAlign: 'center',
                        color: row.layers_aligned === 4 ? 'var(--gold)' : 'var(--text-primary)'
                      }}>
                        {row.layers_aligned}/4
                      </td>

                      {/* Direction */}
                      <td style={{
                        ...cellBase, textAlign: 'center', fontWeight: 500,
                        color: dirColor
                      }}>
                        {row.is_full_stack_consensus ? '\u{1F3C6}' : dirLabel.replace('STRONG_', '')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      <div style={{
        fontFamily: 'IBM Plex Mono', fontSize: '11px',
        color: 'var(--text-dim)', padding: '20px 0', borderTop: '1px solid var(--border)',
        marginTop: '32px'
      }}>
        Not financial advice. SAIN scores are AI-generated for educational purposes only.
      </div>
    </div>
  );
}
