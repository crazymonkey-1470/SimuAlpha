import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import SignalBadge from './SignalBadge';

const COLUMNS = [
  { key: 'ticker', label: 'Ticker', sortable: true },
  { key: 'total_score', label: 'Score', sortable: true },
  { key: 'signal', label: 'Signal', sortable: false },
  { key: 'current_price', label: 'Price', sortable: true },
  { key: 'pct_from_200wma', label: '200WMA %', sortable: true },
  { key: 'pct_from_200mma', label: '200MMA %', sortable: true },
  { key: 'revenue_growth_pct', label: 'Rev Growth', sortable: true },
  { key: 'pe_ratio', label: 'P/E', sortable: true },
  { key: 'ps_ratio', label: 'P/S', sortable: true },
  { key: 'sector', label: 'Sector', sortable: false },
];

export default function ScreenerTable({ data }) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState('total_score');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filtered = data
    .filter(s => {
      if (filter === 'ALL') return true;
      if (filter === 'ENTRY') return s.entry_zone;
      return s.signal === filter;
    })
    .filter(s =>
      !search ||
      s.ticker?.toLowerCase().includes(search.toLowerCase()) ||
      s.company_name?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const av = a[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
      const bv = b[sortKey] ?? (sortDir === 'asc' ? Infinity : -Infinity);
      return sortDir === 'asc' ? av - bv : bv - av;
    });

  return (
    <div>
      <div style={{
        display: 'flex', gap: '12px', marginBottom: '20px',
        flexWrap: 'wrap', alignItems: 'center'
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search ticker or company..."
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '6px', padding: '8px 14px', color: 'var(--text-primary)',
            fontFamily: 'IBM Plex Mono', fontSize: '12px', outline: 'none', width: '240px'
          }}
        />
        {['ALL', 'LOAD THE BOAT', 'ACCUMULATE', 'WATCH', 'ENTRY'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? 'var(--bg-card-hover)' : 'transparent',
              border: `1px solid ${filter === f ? 'var(--border-light)' : 'var(--border)'}`,
              borderRadius: '6px', padding: '6px 12px',
              color: filter === f ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontFamily: 'IBM Plex Mono', fontSize: '11px', cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {f === 'ENTRY' ? 'ENTRY ZONE' : f}
          </button>
        ))}
        <span style={{
          marginLeft: 'auto', fontFamily: 'IBM Plex Mono',
          fontSize: '11px', color: 'var(--text-secondary)'
        }}>
          {filtered.length} stocks
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && handleSort(col.key)}
                  style={{
                    padding: '10px 12px', textAlign: 'left',
                    fontFamily: 'IBM Plex Mono', fontSize: '10px',
                    color: sortKey === col.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                    cursor: col.sortable ? 'pointer' : 'default',
                    whiteSpace: 'nowrap', userSelect: 'none'
                  }}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span style={{ marginLeft: '4px' }}>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((stock, i) => (
              <motion.tr
                key={stock.ticker}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => navigate(`/ticker/${stock.ticker}`)}
                style={{
                  borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  borderLeft: stock.entry_zone ? '3px solid var(--signal-green)' : '3px solid transparent',
                  transition: 'background 0.15s ease'
                }}
                whileHover={{ backgroundColor: 'var(--bg-card)' }}
              >
                <td style={{ padding: '12px' }}>
                  <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {stock.ticker}
                  </div>
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)' }}>
                    {stock.company_name?.substring(0, 20)}
                  </div>
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    fontFamily: 'IBM Plex Mono', fontSize: '16px', fontWeight: 500,
                    color: stock.total_score >= 75 ? 'var(--signal-green)' : stock.total_score >= 60 ? 'var(--signal-amber)' : 'var(--text-secondary)'
                  }}>
                    {stock.total_score}
                  </span>
                </td>
                <td style={{ padding: '12px' }}><SignalBadge signal={stock.signal} size="sm" /></td>
                <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-primary)' }}>
                  ${stock.current_price?.toFixed(2) ?? '\u2014'}
                </td>
                <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: stock.pct_from_200wma <= 0 ? 'var(--signal-green)' : 'var(--text-primary)' }}>
                  {stock.pct_from_200wma?.toFixed(1) ?? '\u2014'}%
                </td>
                <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: stock.pct_from_200mma <= 0 ? 'var(--signal-green)' : 'var(--text-primary)' }}>
                  {stock.pct_from_200mma?.toFixed(1) ?? '\u2014'}%
                </td>
                <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: stock.revenue_growth_pct > 0 ? 'var(--signal-green)' : 'var(--red)' }}>
                  {stock.revenue_growth_pct > 0 ? '+' : ''}{stock.revenue_growth_pct?.toFixed(1) ?? '\u2014'}%
                </td>
                <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-primary)' }}>
                  {stock.pe_ratio?.toFixed(1) ?? '\u2014'}
                </td>
                <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-primary)' }}>
                  {stock.ps_ratio?.toFixed(1) ?? '\u2014'}
                </td>
                <td style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {stock.sector ?? '\u2014'}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
