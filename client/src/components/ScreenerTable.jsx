import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import SignalBadge from './SignalBadge';
import ScoreRing from './ScoreRing';

function formatPct(val) {
  if (val == null) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}%`;
}

function formatPrice(val) {
  if (val == null) return '—';
  return `$${val.toFixed(2)}`;
}

function formatRevGrowth(val) {
  if (val == null) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}%`;
}

const COLUMNS = [
  { key: 'ticker', label: 'TICKER' },
  { key: 'current_price', label: 'PRICE' },
  { key: 'pct_from_200wma', label: '% 200WMA' },
  { key: 'pct_from_200mma', label: '% 200MMA' },
  { key: 'revenue_growth_pct', label: 'REV GROWTH' },
  { key: 'total_score', label: 'SCORE' },
  { key: 'signal', label: 'SIGNAL' },
];

export default function ScreenerTable({ data }) {
  const [sortKey, setSortKey] = useState('total_score');
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortAsc ? av - bv : bv - av;
  });

  function handleSort(key) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="px-3 py-2 text-left text-xs font-mono text-text-secondary uppercase tracking-wider cursor-pointer hover:text-accent transition-colors"
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1 text-accent">{sortAsc ? '▲' : '▼'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <motion.tr
              key={row.ticker}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.3 }}
              className="border-b border-border/50 hover:bg-bg-hover transition-colors"
            >
              <td className="px-3 py-3">
                <Link
                  to={`/ticker/${row.ticker}`}
                  className="font-mono font-medium text-accent hover:underline"
                >
                  {row.ticker}
                </Link>
                {row.company_name && (
                  <div className="text-xs text-text-secondary truncate max-w-[150px]">
                    {row.company_name}
                  </div>
                )}
              </td>
              <td className="px-3 py-3 font-mono">{formatPrice(row.current_price)}</td>
              <td className="px-3 py-3 font-mono" style={{ color: row.pct_from_200wma <= 0 ? '#00ff88' : '#f5a623' }}>
                {formatPct(row.pct_from_200wma)}
              </td>
              <td className="px-3 py-3 font-mono" style={{ color: row.pct_from_200mma <= 0 ? '#00ff88' : '#f5a623' }}>
                {formatPct(row.pct_from_200mma)}
              </td>
              <td className="px-3 py-3 font-mono" style={{ color: row.revenue_growth_pct > 0 ? '#00ff88' : '#f5a623' }}>
                {formatRevGrowth(row.revenue_growth_pct)}
              </td>
              <td className="px-3 py-3">
                <ScoreRing score={row.total_score || 0} size={44} strokeWidth={3} />
              </td>
              <td className="px-3 py-3">
                <SignalBadge signal={row.signal || 'WATCH'} />
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="text-center py-12 text-text-secondary font-mono text-sm">
          No results. Run a scan to populate data.
        </div>
      )}
    </div>
  );
}
