import { useMemo } from 'react';
import { useTickerData } from '../../hooks/useTickerData';

// Fallback data — only used when Supabase has no rows / is unreachable.
// Real tickers, plausible price stamps, no signal (rendered as "—").
const FALLBACK_TICKERS = [
  { ticker: 'NVDA',  price: 142.87 }, { ticker: 'AAPL',  price: 228.51 },
  { ticker: 'MSFT',  price: 438.12 }, { ticker: 'TSLA',  price: 352.94 },
  { ticker: 'META',  price: 592.03 }, { ticker: 'GOOGL', price: 191.45 },
  { ticker: 'AMZN',  price: 224.68 }, { ticker: 'BRK.B', price: 462.10 },
  { ticker: 'JPM',   price: 241.77 }, { ticker: 'UNH',   price: 498.32 },
  { ticker: 'XOM',   price: 114.90 }, { ticker: 'V',     price: 306.21 },
  { ticker: 'LLY',   price: 786.44 }, { ticker: 'AVGO',  price: 166.29 },
  { ticker: 'COST',  price: 908.55 }, { ticker: 'WMT',   price:  88.17 },
  { ticker: 'ORCL',  price: 181.62 }, { ticker: 'MA',    price: 528.04 },
  { ticker: 'HD',    price: 398.73 }, { ticker: 'PG',    price: 168.40 },
  { ticker: 'NFLX',  price: 780.11 }, { ticker: 'AMD',   price: 136.92 },
].map(t => ({ ...t, signal: '', tag: '—', tone: 'dim', score: null }));

function makeKpis(totalCount) {
  // Live count when we have one, otherwise the marketing default.
  const stockCount = totalCount && totalCount > 0
    ? Math.floor(totalCount / 5) * 5      // round down to nearest 5 ("500+", "505+", …)
    : 500;
  return [
    { n: String(stockCount), unit: '+',    l: 'Stocks Scored Daily' },
    { n: '8',                unit: '/ 8',  l: 'Super Investors Tracked' },
    { n: '20',               unit: '+',    l: 'Intelligence Sources' },
    { n: '$10',              unit: '/ mo', l: 'vs $2,000 Bloomberg' },
  ];
}

function buildPass(tickers, kpis) {
  const items = [];
  // Spread the 4 KPIs evenly through ~28 slots so one is usually visible
  const slots = 28;
  const kpiPositions = [0, 7, 14, 21];
  let q = 0;
  for (let i = 0; i < slots; i++) {
    if (kpiPositions.includes(i)) {
      items.push({ kind: 'kpi', data: kpis[kpiPositions.indexOf(i)] });
    } else {
      const t = tickers[q++ % tickers.length];
      items.push({ kind: 'quote', ...t });
    }
    if (i < slots - 1) items.push({ kind: 'sep' });
  }
  return items;
}

function formatPrice(p) {
  if (p == null || Number.isNaN(p)) return '—';
  // Tabular alignment: pad sub-100 prices with a leading space.
  const fixed = Number(p).toFixed(2);
  return Number(p) < 100 ? ` ${fixed}` : fixed;
}

const TONE_CLASS = {
  green: 'tk-tone-green',
  amber: 'tk-tone-amber',
  red:   'tk-tone-red',
  gold:  'tk-tone-gold',
  dim:   'tk-tone-dim',
};

export default function TickerTape() {
  const { tickers: liveTickers, totalCount } = useTickerData(30);

  // Re-build the pass whenever the live data flips from empty → populated.
  // Stable across re-renders so the CSS scroll animation doesn't reset.
  const items = useMemo(() => {
    const source = liveTickers.length > 0 ? liveTickers : FALLBACK_TICKERS;
    return buildPass(source, makeKpis(totalCount));
  }, [liveTickers, totalCount]);

  const renderItem = (item, idx) => {
    if (item.kind === 'sep') return <span key={idx} className="tk-sep">•</span>;
    if (item.kind === 'kpi') {
      return (
        <span key={idx} className="tk-item tk-kpi">
          <span className="n">{item.data.n}<span className="unit">{item.data.unit}</span></span>
          <span className="l">{item.data.l}</span>
        </span>
      );
    }
    return (
      <span key={idx} className="tk-item">
        <span className="tk-sym">{item.ticker}</span>
        <span className="tk-val">{formatPrice(item.price)}</span>
        <span className={`tk-delta ${TONE_CLASS[item.tone] || 'tk-tone-dim'}`}>
          {item.tag}
        </span>
      </span>
    );
  };

  return (
    <section className="ticker-tape" aria-label="Live market feed" style={{ marginBottom: 96 }}>
      <div className="lane">
        {items.map(renderItem)}
        {items.map((it, i) => renderItem(it, i + items.length))}
      </div>
    </section>
  );
}
