import { useMemo } from 'react';

const KPIS = [
  { n: '500', unit: '+',    l: 'Stocks Scored Daily' },
  { n: '8',   unit: '/ 8',  l: 'Super Investors Tracked' },
  { n: '20',  unit: '+',    l: 'Intelligence Sources' },
  { n: '$10', unit: '/ mo', l: 'vs $2,000 Bloomberg' },
];

const QUOTES = [
  ['NVDA',  '142.87'], ['AAPL',  '228.51'], ['MSFT',  '438.12'],
  ['TSLA',  '352.94'], ['META',  '592.03'], ['GOOGL', '191.45'],
  ['AMZN',  '224.68'], ['BRK.B', '462.10'], ['JPM',   '241.77'],
  ['UNH',   '498.32'], ['XOM',   '114.90'], ['V',     '306.21'],
  ['LLY',   '786.44'], ['AVGO',  '166.29'], ['COST',  '908.55'],
  ['WMT',   ' 88.17'], ['ORCL',  '181.62'], ['MA',    '528.04'],
  ['HD',    '398.73'], ['PG',    '168.40'], ['NFLX',  '780.11'],
  ['AMD',   '136.92'], ['CRM',   '331.58'], ['COIN',  '276.85'],
  ['SHOP',  '103.44'], ['PLTR',  ' 62.19'], ['SOFI',  ' 14.33'],
  ['HOOD',  ' 34.26'], ['SQ',    ' 87.01'], ['SPOT',  '481.22'],
];

function buildPass() {
  const items = [];
  const shuffled = QUOTES.slice().sort(() => Math.random() - 0.5);
  const kpiPositions = [0, 7, 14, 21];
  let q = 0;
  for (let i = 0; i < 28; i++) {
    if (kpiPositions.includes(i)) {
      items.push({ kind: 'kpi', data: KPIS[kpiPositions.indexOf(i)] });
    } else {
      const [sym, price] = shuffled[q++ % shuffled.length];
      const up = Math.random() > 0.42;
      const pct = (Math.random() * 3.4 + 0.05).toFixed(2);
      items.push({ kind: 'quote', sym, price: price.trim(), up, pct });
    }
    if (i < 27) items.push({ kind: 'sep' });
  }
  return items;
}

export default function TickerTape() {
  // Build a single pass once (per mount), then render twice for the seamless loop.
  const pass = useMemo(() => buildPass(), []);

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
        <span className="tk-sym">{item.sym}</span>
        <span className="tk-val">{item.price}</span>
        <span className={`tk-delta ${item.up ? 'up' : 'down'}`}>
          {item.up ? '▲' : '▼'} {item.pct}%
        </span>
      </span>
    );
  };

  return (
    <section className="ticker-tape" aria-label="Live market feed" style={{ marginBottom: 96 }}>
      <div className="lane">
        {pass.map(renderItem)}
        {pass.map((it, i) => renderItem(it, i + pass.length))}
      </div>
    </section>
  );
}
