import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import SignalBadge from './SignalBadge';
import ScoreRing from './ScoreRing';

const COLUMNS = [
  { key: 'ticker', label: 'TICKER' },
  { key: 'total_score', label: 'SCORE' },
  { key: 'signal', label: 'SIGNAL' },
  { key: 'entry_zone', label: 'ENTRY' },
  { key: 'current_price', label: 'PRICE' },
  { key: 'pct_from_200wma', label: '% WMA' },
  { key: 'pct_from_200mma', label: '% MMA' },
  { key: 'revenue_growth_pct', label: 'REV GR' },
  { key: 'pe_ratio', label: 'P/E' },
  { key: 'ps_ratio', label: 'P/S' },
  { key: 'wave_position', label: 'WAVE' },
  { key: 'bt_win_rate', label: 'BT WIN%' },
  { key: 'sector', label: 'SECTOR' },
];

function f(v, d = 1) { return v == null ? '—' : Number(v).toFixed(d); }
function fPct(v) { if (v == null) return '—'; return `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`; }

export default function ScreenerTable({ data, searchQuery = '' }) {
  const [sortKey, setSortKey] = useState('total_score');
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = searchQuery
    ? data.filter((r) => r.ticker?.toLowerCase().includes(searchQuery.toLowerCase()) || r.company_name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : data;

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'boolean') return sortAsc ? (av ? -1 : 1) : (av ? 1 : -1);
    if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortAsc ? av - bv : bv - av;
  });

  function toggleSort(key) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border">
            {COLUMNS.map((c) => (
              <th key={c.key} onClick={() => toggleSort(c.key)}
                className={`px-2 py-2 text-left font-mono uppercase tracking-wider cursor-pointer whitespace-nowrap transition-colors ${sortKey === c.key ? 'text-green' : 'text-text-secondary hover:text-text-primary'}`}>
                {c.label}{sortKey === c.key && <span className="ml-0.5">{sortAsc ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <motion.tr key={r.ticker}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02, duration: 0.2 }}
              className={`border-b border-border/30 hover:bg-bg-card-hover transition-all ${r.entry_zone ? 'border-l-2 border-l-green/60' : ''}`}>
              <td className="px-2 py-2">
                <Link to={`/ticker/${r.ticker}`} className="font-mono font-medium text-green hover:underline">{r.ticker}</Link>
                {r.company_name && <div className="text-[9px] text-text-secondary truncate max-w-[100px]">{r.company_name}</div>}
              </td>
              <td className="px-2 py-2"><ScoreRing score={r.total_score || 0} size={32} strokeWidth={2.5} /></td>
              <td className="px-2 py-2"><SignalBadge signal={r.signal || 'WATCH'} compact /></td>
              <td className="px-2 py-2">{r.entry_zone ? <span className="text-green text-[9px]">ACTIVE</span> : <span className="text-text-dim text-[9px]">—</span>}</td>
              <td className="px-2 py-2 font-mono">${f(r.current_price, 2)}</td>
              <td className="px-2 py-2 font-mono" style={{ color: r.pct_from_200wma <= 0 ? '#00ff88' : '#f5a623' }}>{fPct(r.pct_from_200wma)}</td>
              <td className="px-2 py-2 font-mono" style={{ color: r.pct_from_200mma <= 0 ? '#00ff88' : '#f5a623' }}>{fPct(r.pct_from_200mma)}</td>
              <td className="px-2 py-2 font-mono" style={{ color: r.revenue_growth_pct > 0 ? '#00ff88' : '#ff4466' }}>{fPct(r.revenue_growth_pct)}</td>
              <td className="px-2 py-2 font-mono">{f(r.pe_ratio)}</td>
              <td className="px-2 py-2 font-mono">{f(r.ps_ratio)}</td>
              <td className="px-2 py-2">
                {r.wave_position ? (
                  <span className="font-mono text-[9px] px-1.5 py-0.5 border" style={{
                    color: r.wave_tli === 'BUY_ZONE' ? '#00ff88' : r.wave_tli === 'AVOID' ? '#ff4466' : '#f5a623',
                    borderColor: r.wave_tli === 'BUY_ZONE' ? '#00ff8844' : r.wave_tli === 'AVOID' ? '#ff446644' : '#f5a62344',
                  }}>{r.wave_position}</span>
                ) : <span className="text-text-dim text-[9px]">—</span>}
              </td>
              <td className="px-2 py-2 font-mono text-[10px]" style={{
                color: r.bt_win_rate >= 60 ? '#00ff88' : r.bt_win_rate >= 40 ? '#f5a623' : r.bt_win_rate != null ? '#ff4466' : undefined
              }}>{r.bt_win_rate != null ? `${Number(r.bt_win_rate).toFixed(0)}%` : '—'}</td>
              <td className="px-2 py-2 font-mono text-text-secondary text-[9px]">{r.sector || '—'}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="text-center py-12 text-text-secondary font-mono text-xs">
          {searchQuery ? 'No results match your search.' : 'Pipeline initializing — first scan running. Check back in 10 minutes.'}
        </div>
      )}
    </div>
  );
}
