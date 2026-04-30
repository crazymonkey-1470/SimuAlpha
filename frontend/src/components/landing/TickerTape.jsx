import { useMemo } from 'react';
import { useTickerData } from '../../hooks/useTickerData';

// Placeholder shown only while live data is loading / unavailable.
// Tickers only — no fabricated prices (formatPrice renders null as "—").
const FALLBACK_TICKERS = [
  'NVDA', 'AAPL', 'MSFT', 'TSLA', 'META', 'GOOGL', 'AMZN', 'BRK.B',
  'JPM',  'UNH',  'XOM',  'V',    'LLY',  'AVGO',  'COST', 'WMT',
  'ORCL', 'MA',   'HD',   'PG',   'NFLX', 'AMD',
].map(ticker => ({ ticker, price: null, signal: '', tag: '—', tone: 'dim', score: null }));

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
