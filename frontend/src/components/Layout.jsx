import { Outlet } from 'react-router-dom';
import NavBar from './NavBar';

export default function Layout() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <NavBar />
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 24px 80px' }}>
        <Outlet />
      </main>
      <footer style={{
        textAlign: 'center',
        padding: '24px',
        color: 'var(--text-dim)',
        fontSize: '11px',
        fontFamily: 'IBM Plex Mono',
        borderTop: '1px solid var(--border)'
      }}>
        Not financial advice. Educational tool only. Do your own research.
      </footer>
    </div>
  );
}
