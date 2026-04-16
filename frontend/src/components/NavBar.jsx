import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSAINSignalCount } from '../hooks/useSAIN';
import SearchBar from './SearchBar';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/screener', label: 'Screener' },
  { to: '/signals', label: 'Signals', badge: true },
  { to: '/investors', label: 'Investors' },
  { to: '/my', label: 'My' },
  { to: '/market', label: 'Market' },
  { to: '/backtesting', label: 'Backtest' },
  { to: '/agent', label: 'Agent' },
];

export default function NavBar() {
  const location = useLocation();
  const signalCount = useSAINSignalCount();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (to) =>
    to === '/'
      ? location.pathname === '/'
      : location.pathname === to || location.pathname.startsWith(to + '/');

  return (
    <>
      <nav style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '60px',
        position: 'sticky',
        top: 0,
        background: 'rgba(12, 12, 14, 0.95)',
        backdropFilter: 'blur(12px)',
        zIndex: 100,
      }}>
        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
          <span style={{
            fontFamily: 'Cormorant Garamond',
            fontSize: '20px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            letterSpacing: '0.05em',
          }}>
            The Long Screener
          </span>
        </Link>

        {/* Desktop nav (hidden on mobile via CSS) */}
        <div className="hide-mobile" style={{
          display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap',
        }}>
          <SearchBar />
          {links.map(link => {
            const active = isActive(link.to);
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
                  display: 'flex', alignItems: 'center', gap: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                {link.label}
                {link.badge && signalCount > 0 && (
                  <span style={{
                    background: 'var(--signal-green)', color: '#0c0c0e',
                    fontSize: '9px', fontWeight: 600, padding: '1px 5px',
                    borderRadius: '8px', minWidth: '16px', textAlign: 'center', lineHeight: '14px',
                  }}>
                    {signalCount > 99 ? '99+' : signalCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Mobile right side: search + hamburger */}
        <div className="show-mobile" style={{ alignItems: 'center', gap: '10px' }}>
          <SearchBar />
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '8px 10px',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              flexShrink: 0,
            }}
          >
            <span style={{
              display: 'block', width: '18px', height: '2px',
              background: 'var(--text-primary)',
              borderRadius: '1px',
              transition: 'transform 0.2s, opacity 0.2s',
              transform: menuOpen ? 'translateY(6px) rotate(45deg)' : 'none',
            }} />
            <span style={{
              display: 'block', width: '18px', height: '2px',
              background: 'var(--text-primary)',
              borderRadius: '1px',
              opacity: menuOpen ? 0 : 1,
              transition: 'opacity 0.2s',
            }} />
            <span style={{
              display: 'block', width: '18px', height: '2px',
              background: 'var(--text-primary)',
              borderRadius: '1px',
              transition: 'transform 0.2s, opacity 0.2s',
              transform: menuOpen ? 'translateY(-6px) rotate(-45deg)' : 'none',
            }} />
          </button>
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="mobile-menu" onClick={() => setMenuOpen(false)}>
          {links.map(link => {
            const active = isActive(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={active ? 'active' : ''}
                style={{ textDecoration: 'none' }}
              >
                {link.label}
                {link.badge && signalCount > 0 && (
                  <span style={{
                    background: 'var(--signal-green)', color: '#0c0c0e',
                    fontSize: '9px', fontWeight: 600, padding: '1px 5px',
                    borderRadius: '8px', lineHeight: '14px',
                  }}>
                    {signalCount > 99 ? '99+' : signalCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
