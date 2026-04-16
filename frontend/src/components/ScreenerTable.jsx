import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import SignalBadge from './SignalBadge';
import WavePositionIndicator from './WavePositionIndicator';
import VolumeTrendBadge from './VolumeTrendBadge';

const ALL_COLUMNS = [
  { key: 'watchlist', label: '\u2606', sortable: false, default: true },
  { key: 'ticker', label: 'Ticker', sortable: true, default: true },
  { key: 'total_score', label: 'Score', sortable: true, default: true },
  { key: 'signal', label: 'Signal', sortable: false, default: true },
  { key: 'current_price', label: 'Price', sortable: true, default: true },
  { key: 'pct_from_200wma', label: '200WMA %', sortable: true, default: true },
  { key: 'pct_from_200mma', label: '200MMA %', sortable: true, default: true },
  { key: 'revenue_growth_pct', label: 'Rev Growth', sortable: true, default: true },
  { key: 'pe_ratio', label: 'P/E', sortable: true, default: true },
  { key: 'ps_ratio', label: 'P/S', sortable: true, default: true },
  { key: 'sector', label: 'Sector', sortable: false, default: true },
  { key: 'wave', label: 'Wave', sortable: false, default: true },
  { key: 'lynch_score', label: 'Lynch', sortable: true, default: false },
  { key: 'buffett_score', label: 'Buffett', sortable: true, default: false },
  { key: 'operating_margin', label: 'Op Margin', sortable: true, default: false },
  { key: 'fcf_margin', label: 'FCF Margin', sortable: true, default: false },
  { key: 'volume_trend', label: 'Volume', sortable: false, default: false },
  { key: 'gross_margin_current', label: 'Gross Margin', sortable: true, default: false },
  { key: 'backtest_win', label: 'Backtest Win %', sortable: false, default: false },
  { key: 'analyze', label: '', sortable: false, default: true },
];

const STORAGE_KEY = 'simualpha_screener_columns';

function loadVisibleColumns() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return ALL_COLUMNS.filter(c => c.default).map(c => c.key);
}

export default function ScreenerTable({ data, waveData = {}, backtestData = {} }) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState('total_score');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [minScore, setMinScore] = useState(0);
  const [visibleCols, setVisibleCols] = useState(loadVisibleColumns);
  const [showColPicker, setShowColPicker] = useState(false);
  const [analyzingTicker, setAnalyzingTicker] = useState(null);
  const [watchlistMap, setWatchlistMap] = useState({});

  // Fetch watchlist tickers on mount
  useEffect(() => {
    fetch('/api/watchlist')
      .then(r => r.json())
      .then(({ watchlist }) => {
        const map = {};
        (watchlist || []).forEach(w => { map[w.ticker] = w.id; });
        setWatchlistMap(map);
      })
      .catch(() => {});
  }, []);

  async function toggleWatchlist(e, ticker) {
    e.stopPropagation();
    if (watchlistMap[ticker]) {
      await fetch(`/api/watchlist/${watchlistMap[ticker]}`, { method: 'DELETE' });
      setWatchlistMap(prev => { const next = { ...prev }; delete next[ticker]; return next; });
    } else {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      if (res.ok) {
        const { item } = await res.json();
        setWatchlistMap(prev => ({ ...prev, [ticker]: item.id }));
      }
    }
  }

  // Get unique sectors from data
  const sectors = [...new Set(data.map(s => s.sector).filter(Boolean))].sort();

  async function handleAnalyze(e, ticker) {
    e.stopPropagation();
    setAnalyzingTicker(ticker);
    try {
      await fetch(`/api/analyze/${ticker}`, { method: 'POST' });
      setTimeout(() => setAnalyzingTicker(null), 3000);
    } catch {
      setAnalyzingTicker(null);
    }
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleCols));
  }, [visibleCols]);

  const toggleCol = (key) => {
    setVisibleCols(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const columns = ALL_COLUMNS.filter(c => visibleCols.includes(c.key));

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filtered = data
    .filter(s => {
      if (filter === 'ALL') return s.signal !== 'TRIM' && s.signal !== 'AVOID';
      if (filter === 'ENTRY') return s.entry_zone;
      return s.signal === filter;
    })
    .filter(s => sectorFilter === 'ALL' || s.sector === sectorFilter)
    .filter(s => (s.total_score || 0) >= minScore)
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

  const renderCell = (stock, colKey) => {
    const wave = waveData[stock.ticker];
    switch (colKey) {
      case 'watchlist': {
        const isWl = !!watchlistMap[stock.ticker];
        return (
          <td key={colKey} style={{ padding: '12px', width: '36px', textAlign: 'center' }}>
            <button
              onClick={(e) => toggleWatchlist(e, stock.ticker)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: '16px', padding: '2px 4px', lineHeight: 1,
                color: isWl ? 'var(--signal-amber)' : 'var(--text-dim)',
                transition: 'color 0.15s ease',
              }}
              title={isWl ? 'Remove from watchlist' : 'Add to watchlist'}
            >
              {isWl ? '\u2605' : '\u2606'}
            </button>
          </td>
        );
      }
      case 'ticker':
        return (
          <td key={colKey} style={{ padding: '12px' }}>
            <div style={{ fontFamily: 'Cormorant Garamond', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {stock.ticker}
            </div>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-secondary)' }}>
              {stock.company_name?.substring(0, 20)}
            </div>
          </td>
        );
      case 'total_score':
        return (
          <td key={colKey} style={{ padding: '12px' }}>
            <span style={{
              fontFamily: 'IBM Plex Mono', fontSize: '16px', fontWeight: 500,
              color: stock.total_score >= 75 ? 'var(--signal-green)' : stock.total_score >= 60 ? 'var(--signal-amber)' : 'var(--text-secondary)'
            }}>
              {stock.total_score}
            </span>
          </td>
        );
      case 'signal':
        return <td key={colKey} style={{ padding: '12px' }}><SignalBadge signal={stock.signal} size="sm" /></td>;
      case 'current_price':
        return <td key={colKey} style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-primary)' }}>${stock.current_price?.toFixed(2) ?? '\u2014'}</td>;
      case 'pct_from_200wma':
        return <td key={colKey} style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: stock.pct_from_200wma <= 0 ? 'var(--signal-green)' : 'var(--text-primary)' }}>{stock.pct_from_200wma?.toFixed(1) ?? '\u2014'}%</td>;
      case 'pct_from_200mma':
        return <td key={colKey} style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: stock.pct_from_200mma <= 0 ? 'var(--signal-green)' : 'var(--text-primary)' }}>{stock.pct_from_200mma?.toFixed(1) ?? '\u2014'}%</td>;
      case 'revenue_growth_pct':
        return <td key={colKey} style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: stock.revenue_growth_pct > 0 ? 'var(--signal-green)' : 'var(--red)' }}>{stock.revenue_growth_pct > 0 ? '+' : ''}{stock.revenue_growth_pct?.toFixed(1) ?? '\u2014'}%</td>;
      case 'pe_ratio':
        return <td key={colKey} style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-primary)' }}>{stock.pe_ratio?.toFixed(1) ?? '\u2014'}</td>;
      case 'ps_ratio':
        return <td key={colKey} style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-primary)' }}>{stock.ps_ratio?.toFixed(1) ?? '\u2014'}</td>;
      case 'sector':
        return <td key={colKey} style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)' }}>{stock.sector ?? '\u2014'}</td>;
      case 'wave':
        return (
          <td key={colKey} style={{ padding: '12px' }}>
            {wave ? <WavePositionIndicator waveStructure={wave.wave_structure} currentWave={wave.current_wave} tliSignal={wave.tli_signal} compact /> : <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>{'\u2014'}</span>}
          </td>
        );
      case 'volume_trend':
        return (
          <td key={colKey} style={{ padding: '12px' }}>
            <VolumeTrendBadge volumeTrend={stock.volume_trend} volumeTrendRatio={stock.volume_trend_ratio} compact />
          </td>
        );
      case 'gross_margin_current': {
        const gm = stock.gross_margin_current;
        const gmColor = gm == null ? 'var(--text-dim)' : gm > 40 ? 'var(--signal-green)' : gm >= 20 ? 'var(--signal-amber)' : 'var(--red, #ef4444)';
        let trendArrow = '';
        if (stock.gross_margin_history?.length >= 2) {
          const curr = stock.gross_margin_history[stock.gross_margin_history.length - 1];
          const prev = stock.gross_margin_history[stock.gross_margin_history.length - 2];
          if (curr != null && prev != null) trendArrow = curr > prev ? ' \u2191' : curr < prev ? ' \u2193' : '';
        }
        return <td key={colKey} style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: gmColor }}>{gm != null ? `${gm.toFixed(1)}%${trendArrow}` : '\u2014'}</td>;
      }
      case 'backtest_win': {
        const bt = backtestData[stock.ticker];
        if (!bt || bt.total_signals < 3 || bt.win_rate_pct == null) {
          return <td key={colKey} style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-dim)' }}>{'\u2014'}</td>;
        }
        const winColor = bt.win_rate_pct > 65 ? 'var(--signal-green)' : bt.win_rate_pct >= 50 ? 'var(--signal-amber)' : 'var(--red, #ef4444)';
        return <td key={colKey} style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', fontWeight: 500, color: winColor }}>{bt.win_rate_pct.toFixed(0)}%</td>;
      }
      case 'lynch_score': {
        const ls = stock.lynch_score;
        const lsColor = ls >= 7 ? 'var(--signal-green)' : ls >= 5 ? 'var(--signal-amber)' : 'var(--text-secondary)';
        return <td key={colKey} style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: lsColor }}>{ls != null ? `${ls}/7` : '\u2014'}</td>;
      }
      case 'buffett_score': {
        const bs = stock.buffett_score;
        const bsColor = bs >= 6 ? 'var(--signal-green)' : bs >= 4 ? 'var(--signal-amber)' : 'var(--text-secondary)';
        return <td key={colKey} style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: bsColor }}>{bs != null ? `${bs}/9` : '\u2014'}</td>;
      }
      case 'operating_margin': {
        const om = stock.operating_margin;
        const omColor = om == null ? 'var(--text-dim)' : om > 20 ? 'var(--signal-green)' : om >= 10 ? 'var(--signal-amber)' : 'var(--red, #ef4444)';
        return <td key={colKey} style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: omColor }}>{om != null ? `${om.toFixed(1)}%` : '\u2014'}</td>;
      }
      case 'fcf_margin': {
        const fm = stock.fcf_margin;
        const fmColor = fm == null ? 'var(--text-dim)' : fm > 15 ? 'var(--signal-green)' : fm >= 5 ? 'var(--signal-amber)' : 'var(--red, #ef4444)';
        return <td key={colKey} style={{ padding: '12px', fontFamily: 'IBM Plex Mono', fontSize: '13px', color: fmColor }}>{fm != null ? `${fm.toFixed(1)}%` : '\u2014'}</td>;
      }
      case 'analyze':
        return (
          <td key={colKey} style={{ padding: '12px' }}>
            <button
              onClick={(e) => handleAnalyze(e, stock.ticker)}
              disabled={analyzingTicker === stock.ticker}
              style={{
                background: analyzingTicker === stock.ticker ? 'var(--bg-secondary)' : 'var(--signal-green-dim)',
                border: `1px solid ${analyzingTicker === stock.ticker ? 'var(--border)' : 'var(--signal-green)40'}`,
                borderRadius: '4px', padding: '3px 8px',
                color: analyzingTicker === stock.ticker ? 'var(--text-dim)' : 'var(--signal-green)',
                fontFamily: 'IBM Plex Mono', fontSize: '9px', cursor: analyzingTicker === stock.ticker ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {analyzingTicker === stock.ticker ? 'Started' : 'Analyze'}
            </button>
          </td>
        );
      default:
        return <td key={colKey} style={{ padding: '12px' }}>{'\u2014'}</td>;
    }
  };

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
        {['ALL', 'LOAD THE BOAT', 'ACCUMULATE', 'WATCH', 'HOLD', 'CAUTION', 'ENTRY'].map(f => (
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

        <select
          value={sectorFilter}
          onChange={e => setSectorFilter(e.target.value)}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '6px', padding: '6px 10px', color: 'var(--text-primary)',
            fontFamily: 'IBM Plex Mono', fontSize: '11px', outline: 'none',
          }}
        >
          <option value="ALL">All Sectors</option>
          {sectors.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-dim)' }}>Min</span>
          <input
            type="number"
            value={minScore}
            onChange={e => setMinScore(Number(e.target.value) || 0)}
            min={0} max={100}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '6px', padding: '6px 8px', color: 'var(--text-primary)',
              fontFamily: 'IBM Plex Mono', fontSize: '11px', width: '50px', outline: 'none',
            }}
          />
        </div>

        {/* Column selector */}
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <button
            onClick={() => setShowColPicker(!showColPicker)}
            style={{
              background: showColPicker ? 'var(--bg-card-hover)' : 'transparent',
              border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px',
              color: 'var(--text-secondary)', fontFamily: 'IBM Plex Mono', fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            Columns
          </button>
          {showColPicker && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: '4px', zIndex: 50,
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
              padding: '8px', minWidth: '180px', maxWidth: 'calc(100vw - 32px)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
            }}>
              {ALL_COLUMNS.map(col => (
                <label key={col.key} style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px',
                  cursor: 'pointer', fontFamily: 'IBM Plex Mono', fontSize: '11px',
                  color: visibleCols.includes(col.key) ? 'var(--text-primary)' : 'var(--text-dim)'
                }}>
                  <input
                    type="checkbox"
                    checked={visibleCols.includes(col.key)}
                    onChange={() => toggleCol(col.key)}
                    style={{ accentColor: 'var(--signal-green)' }}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <span style={{ fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {filtered.length} stocks
        </span>
      </div>

      <div className="table-wrap" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {columns.map(col => (
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
                {columns.map(col => renderCell(stock, col.key))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
