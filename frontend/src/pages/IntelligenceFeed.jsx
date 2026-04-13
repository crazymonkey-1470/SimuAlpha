import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSAINSignals, usePoliticianSignals, useAIModelSignals, useTopConsensus } from '../hooks/useSAIN';
import SignalCard from '../components/sain/SignalCard';
import PoliticianTradeDetail from '../components/sain/PoliticianTradeDetail';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { useNavigate } from 'react-router-dom';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'politicians', label: 'Politicians' },
  { key: 'ai-models', label: 'AI Models' },
  { key: 'top-consensus', label: 'Top Consensus' },
];

export default function IntelligenceFeed() {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedSignal, setSelectedSignal] = useState(null);

  const { data: allSignals, loading: allLoading, refetch } = useSAINSignals();
  const { data: polSignals, loading: polLoading } = usePoliticianSignals();
  const { data: aiSignals, loading: aiLoading } = useAIModelSignals();
  const { data: topConsensus, loading: topLoading } = useTopConsensus();

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(refetch, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refetch]);

  const handleSelectSignal = useCallback((signal) => {
    if (signal.politician_name) {
      setSelectedSignal(signal);
    }
  }, []);

  return (
    <div style={{ paddingTop: '40px' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: '32px' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{
              fontFamily: 'Cormorant Garamond', fontSize: '48px',
              fontWeight: 300, color: 'var(--text-primary)',
              lineHeight: 1, marginBottom: '8px'
            }}>
              SAIN Intelligence <span style={{ color: 'var(--blue)', fontStyle: 'italic' }}>Feed</span>
            </h1>
            <p style={{
              fontFamily: 'IBM Plex Mono', fontSize: '12px',
              color: 'var(--text-secondary)', lineHeight: 1.6
            }}>
              Real-time signals from politicians, AI models, insiders, and market intelligence.
            </p>
          </div>
          <button
            onClick={refetch}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '8px 16px',
              fontFamily: 'IBM Plex Mono', fontSize: '11px',
              color: 'var(--text-secondary)', cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            &#8635; Refresh
          </button>
        </div>
      </motion.div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '6px', marginBottom: '24px',
        borderBottom: '1px solid var(--border)', paddingBottom: '12px',
        flexWrap: 'wrap'
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                fontFamily: 'IBM Plex Mono', fontSize: '12px',
                padding: '6px 16px', borderRadius: '6px',
                border: active ? '1px solid var(--border-light)' : '1px solid transparent',
                background: active ? 'var(--bg-card)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer', transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === 'all' && (
          <TabPanel key="all" loading={allLoading}>
            <SignalFeed signals={allSignals} onSelect={handleSelectSignal} />
          </TabPanel>
        )}
        {activeTab === 'politicians' && (
          <TabPanel key="politicians" loading={polLoading}>
            <SignalFeed
              signals={[...polSignals].sort((a, b) => {
                if (a.committee_sector_match && !b.committee_sector_match) return -1;
                if (!a.committee_sector_match && b.committee_sector_match) return 1;
                return 0;
              })}
              onSelect={handleSelectSignal}
            />
          </TabPanel>
        )}
        {activeTab === 'ai-models' && (
          <TabPanel key="ai-models" loading={aiLoading}>
            <SignalFeed signals={aiSignals} onSelect={handleSelectSignal} />
          </TabPanel>
        )}
        {activeTab === 'top-consensus' && (
          <TabPanel key="top-consensus" loading={topLoading}>
            <ConsensusTable data={topConsensus} />
          </TabPanel>
        )}
      </AnimatePresence>

      {/* Politician detail modal */}
      <AnimatePresence>
        {selectedSignal && (
          <PoliticianTradeDetail
            signal={selectedSignal}
            onClose={() => setSelectedSignal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TabPanel({ children, loading }) {
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <LoadingSpinner />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

function SignalFeed({ signals, onSelect }) {
  if (!signals || signals.length === 0) {
    return <EmptyState message="No signals yet" sub="Intelligence signals will appear here as they are detected from politicians, AI models, and insider activity." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {signals.map((signal, i) => (
        <SignalCard
          key={signal.id || i}
          signal={signal}
          index={i}
          onSelect={signal.politician_name ? onSelect : undefined}
        />
      ))}
    </div>
  );
}

function ConsensusTable({ data }) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState('total_sain_score');
  const [sortAsc, setSortAsc] = useState(false);

  if (!data || data.length === 0) {
    return <EmptyState message="No consensus data yet" sub="Consensus scores are computed after SAIN signals are collected." />;
  }

  const sorted = [...data].sort((a, b) => {
    const aVal = a[sortKey] ?? 0;
    const bVal = b[sortKey] ?? 0;
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  const columns = [
    { key: 'ticker', label: 'Ticker' },
    { key: 'total_sain_score', label: 'Total' },
    { key: 'super_investor_score', label: 'SuperInv' },
    { key: 'politician_score', label: 'Politicians' },
    { key: 'ai_model_score', label: 'AI' },
    { key: 'tli_score', label: 'TLI' },
    { key: 'consensus_direction', label: 'Dir' },
  ];

  function handleSort(key) {
    if (key === 'ticker' || key === 'consensus_direction') return;
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const cellStyle = {
    fontFamily: 'IBM Plex Mono', fontSize: '12px',
    padding: '10px 12px', borderBottom: '1px solid var(--border)'
  };

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: '10px', overflow: 'hidden'
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    ...cellStyle, fontSize: '10px',
                    color: 'var(--text-secondary)', textTransform: 'uppercase',
                    letterSpacing: '0.08em', textAlign: col.key === 'ticker' ? 'left' : 'center',
                    cursor: col.key !== 'ticker' && col.key !== 'consensus_direction' ? 'pointer' : 'default',
                    background: 'var(--bg-secondary)', fontWeight: 500,
                    whiteSpace: 'nowrap', userSelect: 'none',
                  }}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span style={{ marginLeft: '4px' }}>{sortAsc ? '\u25B2' : '\u25BC'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr
                key={row.ticker}
                onClick={() => navigate(`/ticker/${row.ticker}`)}
                style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ ...cellStyle, color: 'var(--text-primary)', fontWeight: 600 }}>
                  {row.is_full_stack_consensus && <span style={{ marginRight: '6px' }}>&#127942;</span>}
                  {row.ticker}
                </td>
                <td style={{
                  ...cellStyle, textAlign: 'center', fontWeight: 600,
                  color: row.total_sain_score > 0 ? 'var(--signal-green)'
                    : row.total_sain_score < 0 ? 'var(--red)' : 'var(--text-secondary)'
                }}>
                  {row.total_sain_score > 0 ? '+' : ''}{row.total_sain_score}
                </td>
                {['super_investor_score', 'politician_score', 'ai_model_score', 'tli_score'].map(k => (
                  <td key={k} style={{
                    ...cellStyle, textAlign: 'center',
                    color: (row[k] ?? 0) > 0 ? 'var(--signal-green)'
                      : (row[k] ?? 0) < 0 ? 'var(--red)' : 'var(--text-dim)'
                  }}>
                    {(row[k] ?? 0) > 0 ? '+' : ''}{row[k] ?? 0}
                  </td>
                ))}
                <td style={{
                  ...cellStyle, textAlign: 'center', fontWeight: 500,
                  color: row.consensus_direction?.includes('BUY') ? 'var(--signal-green)'
                    : row.consensus_direction?.includes('SELL') ? 'var(--red)' : 'var(--signal-amber)'
                }}>
                  {row.is_full_stack_consensus ? '\u{1F3C6}'
                    : row.consensus_direction?.includes('BUY') ? 'Entry'
                    : row.consensus_direction?.includes('SELL') ? 'Reduce' : '\u2014'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
