import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase';
import Fresco from '../components/Fresco';
import { ArrowIcon, Lozenge, LozengeRule } from '../components/Icons';

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
      <Fresco className="login-fresco" />
      <div className="login-panel">
        <p className="eyebrow">
          <Lozenge size={7} />
          <span>Private prep room</span>
          <Lozenge size={7} />
        </p>
        <h1 className="wordmark-hero">TRUE·ADAM</h1>
        <LozengeRule width={180} />
        <p className="motto">Reclaiming manhood as God calls men to be.</p>
        <p className="tagline">The week’s reading, talking points and episode plans for Freddy, Stew &amp; Mike.</p>
        <form onSubmit={submit} className="stack login-form">
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
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && <ArrowIcon size={16} />}
          </button>
          {err && <p className="error">{err}</p>}
        </form>
        <p className="muted small login-help">No account or forgot your password? Ask the producer.</p>
        <p className="muted small login-help">
          A listener with a question for the show? <a href="#/ask">Ask it here</a>.
        </p>
      </div>
    </div>
  );
}
