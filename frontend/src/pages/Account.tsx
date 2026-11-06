import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../supabase';
import { useApp } from '../lib';

export default function Account() {
  const { me, session, reloadProfiles } = useApp();
  const [name, setName] = useState(me.display_name);
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', me.id);
    setMsg(error ? { ok: false, text: errorText(error) } : { ok: true, text: 'Name saved.' });
    if (!error) reloadProfiles();
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Password changed.' });
    if (!error) setPassword('');
  }

  return (
    <div className="narrow">
      <h1>Account</h1>
      <p className="muted">
        {session.user.email} · {me.role}
      </p>
      <form onSubmit={saveName} className="stack">
        <label>
          Display name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <button className="primary" disabled={!name.trim() || name.trim() === me.display_name}>
          Save name
        </button>
      </form>
      <form onSubmit={savePassword} className="stack">
        <label>
          New password
          <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button disabled={password.length < 8}>Change password</button>
      </form>
      {msg && <p className={msg.ok ? 'success' : 'error'}>{msg.text}</p>}
      <button className="danger" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
    </div>
  );
}
