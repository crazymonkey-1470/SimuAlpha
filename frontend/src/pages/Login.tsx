import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase';
import LazyGlobe from '../globe/LazyGlobe';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
  }

  return (
    <div className="login-page">
      <LazyGlobe />
      <div className="login-panel">
        <div className="eyebrow">
          <span className="dot" /> Private prep room
        </div>
        <h1 className="wordmark-hero">
          True<em>Adam</em>
        </h1>
        <p className="tagline">
          Reclaiming manhood as God calls men to be. The week’s reading, talking points and episode plans for
          Freddy, Stew &amp; Mike.
        </p>
        <form onSubmit={submit} className="stack">
          <label>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in →'}
          </button>
          {err && <p className="error">{err}</p>}
        </form>
        <p className="muted small">No account or forgot your password? Ask the producer.</p>
      </div>
    </div>
  );
}
