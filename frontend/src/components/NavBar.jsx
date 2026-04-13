import { Link, useLocation } from 'react-router-dom';
import { useSAINSignalCount } from '../hooks/useSAIN';
import SearchBar from './SearchBar';

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/screener', label: 'Screener' },
  { to: '/signals', label: 'Signals' },
  { to: '/investors', label: 'Investors' },
  { to: '/intelligence', label: 'Intelligence', badge: true },
  { to: '/consensus', label: 'SAIN Consensus' },
  { to: '/market', label: 'Market' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/agent', label: 'Agent' },
];

export default function NavBar() {
  const location = useLocation();
  const signalCount = useSAINSignalCount();

  return (
    <nav style={{
      borderBottom: '1px solid var(--border)',
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: '60px',
      position: 'sticky',
      top: 0,
      background: 'rgba(12, 12, 14, 0.95)',
      backdropFilter: 'blur(12px)',
      zIndex: 100
    }}>
      <Link to="/" style={{ textDecoration: 'none' }}>
        <span style={{
          fontFamily: 'Cormorant Garamond',
          fontSize: '20px',
          fontWeight: 500,
          color: 'var(--text-primary)',
          letterSpacing: '0.05em'
        }}>
          The Long Screener
        </span>
      </Link>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchBar />
        {links.map(link => {
          const active = link.to === '/'
            ? location.pathname === '/'
            : location.pathname === link.to || location.pathname.startsWith(link.to + '/');
          return (
            <Link
              key={link.to}
              to={link.to}
              style={{
                textDecoration: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontFamily: 'IBM Plex Mono',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: active ? 'var(--bg-card)' : 'transparent',
                border: active ? '1px solid var(--border-light)' : '1px solid transparent',
                transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              {link.label}
              {link.badge && signalCount > 0 && (
                <span style={{
                  background: 'var(--signal-green)',
                  color: '#0c0c0e',
                  fontSize: '9px',
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: '8px',
                  minWidth: '16px',
                  textAlign: 'center',
                  lineHeight: '14px'
                }}>
                  {signalCount > 99 ? '99+' : signalCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
