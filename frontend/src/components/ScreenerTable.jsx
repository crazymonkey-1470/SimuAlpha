import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import SignalBadge from './SignalBadge';
import ScoreRing from './ScoreRing';

const COLUMNS = [
  { key: 'ticker', label: 'TICKER' },
  { key: 'total_score', label: 'SCORE' },
  { key: 'signal', label: 'SIGNAL' },
  { key: 'current_price', label: 'PRICE' },
  { key: 'pct_from_200wma', label: '% 200WMA' },
  { key: 'pct_from_200mma', label: '% 200MMA' },
  { key: 'revenue_growth_pct', label: 'REV GROWTH' },
  { key: 'pe_ratio', label: 'P/E' },
  { key: 'ps_ratio', label: 'P/S' },
  { key: 'sector', label: 'SECTOR' },
];

function fmt(val, dec = 1) {
  if (val == null) return '—';
  return Number(val).toFixed(dec);
}

function fmtPct(val) {
  if (val == null) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${Number(val).toFixed(1)}%`;
}

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
                className={`px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider cursor-pointer transition-colors whitespace-nowrap ${
                  sortKey === col.key ? 'text-green' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1">{sortAsc ? '▲' : '▼'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <motion.tr
              key={row.ticker}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02, duration: 0.25 }}
              className="border-b border-border/40 hover:bg-bg-card-hover hover:border-l-2 hover:border-l-green/50 transition-all"
            >
              <td className="px-3 py-2.5">
                <Link to={`/ticker/${row.ticker}`} className="font-mono font-medium text-green hover:underline">
                  {row.ticker}
                </Link>
                {row.company_name && (
                  <div className="text-[10px] text-text-secondary truncate max-w-[120px]">{row.company_name}</div>
                )}
              </td>
              <td className="px-3 py-2.5">
                <ScoreRing score={row.total_score || 0} size={36} strokeWidth={3} />
              </td>
              <td className="px-3 py-2.5">
                <SignalBadge signal={row.signal || 'WATCH'} />
              </td>
              <td className="px-3 py-2.5 font-mono">${fmt(row.current_price, 2)}</td>
              <td className="px-3 py-2.5 font-mono" style={{ color: row.pct_from_200wma <= 0 ? '#00ff88' : '#f5a623' }}>
                {fmtPct(row.pct_from_200wma)}
              </td>
              <td className="px-3 py-2.5 font-mono" style={{ color: row.pct_from_200mma <= 0 ? '#00ff88' : '#f5a623' }}>
                {fmtPct(row.pct_from_200mma)}
              </td>
              <td className="px-3 py-2.5 font-mono" style={{ color: row.revenue_growth_pct > 0 ? '#00ff88' : '#ff4466' }}>
                {fmtPct(row.revenue_growth_pct)}
              </td>
              <td className="px-3 py-2.5 font-mono">{fmt(row.pe_ratio)}</td>
              <td className="px-3 py-2.5 font-mono">{fmt(row.ps_ratio)}</td>
              <td className="px-3 py-2.5 font-mono text-text-secondary text-xs">{row.sector || '—'}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="text-center py-16 text-text-secondary font-mono text-sm">
          First scan in progress. Check back in a few minutes.
        </div>
      )}
    </div>
  );
}
