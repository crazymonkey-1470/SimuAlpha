import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import usePageTitle from '../hooks/usePageTitle';

const Watchlist = lazy(() => import('./Watchlist'));
const Portfolio = lazy(() => import('./Portfolio'));

const TABS = [
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'portfolio', label: 'Portfolio' },
];

export default function My() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some(t => t.key === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'watchlist';
  usePageTitle(tab === 'portfolio' ? 'Portfolio' : 'Watchlist');

  const setTab = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <div style={{
        display: 'flex', gap: '8px', paddingTop: '40px',
        borderBottom: '1px solid var(--border)', marginBottom: '-40px',
        position: 'relative', zIndex: 1,
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: tab === t.key ? 'var(--bg-card-hover)' : 'transparent',
              border: `1px solid ${tab === t.key ? 'var(--border-light)' : 'var(--border)'}`,
              borderBottom: tab === t.key ? '1px solid var(--bg)' : '1px solid var(--border)',
              borderRadius: '6px 6px 0 0',
              padding: '8px 20px',
              color: tab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontFamily: 'IBM Plex Mono', fontSize: '11px', cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Suspense fallback={<div style={{ paddingTop: '100px' }}><LoadingSpinner /></div>}>
        {tab === 'portfolio' ? <Portfolio /> : <Watchlist />}
      </Suspense>
    </div>
  );
}
