import { Link, useLocation } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/screener', label: 'Screener' },
  { to: '/signals', label: 'Signals' },
  { to: '/watchlist', label: 'Watchlist' },
];

export default function NavBar() {
  const location = useLocation();

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

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {links.map(link => {
          const active = location.pathname === link.to;
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
                transition: 'all 0.15s ease'
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
