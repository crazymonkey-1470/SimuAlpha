import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../supabase';
import { useApp, useLoad } from '../lib';
import type { MemoryCard } from '../types';
import { MemoryForm, MemoryRow } from '../components/Memory';

export default function Account() {
  const { me, session, reloadProfiles } = useApp();
  const [name, setName] = useState(me.display_name);
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mem = useLoad(
    () =>
      supabase
        .from('memory_cards')
        .select('*')
        .eq('about_member', me.id)
        .is('invalid_at', null)
        .order('pinned', { ascending: false })
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false }),
    [me.id],
  );

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

      <section className="memory-section">
        <h2>
          <span>
            What Grok <em>knows</em> about you
          </span>
        </h2>
        <p className="hint">
          Grok reads this before it answers you, and adds to it as it learns. Only you and the producer can see it.
        </p>
        <MemoryForm aboutMe onDone={mem.reload} />
        {mem.error && <p className="error">{mem.error}</p>}
        {mem.data && (mem.data as MemoryCard[]).length === 0 && <p className="empty">Nothing yet. Tell Grok what you’re into.</p>}
        <div className="memory-list">
          {((mem.data ?? []) as MemoryCard[]).map((m) => (
            <MemoryRow key={m.id} m={m} onChange={mem.reload} showSubject={false} />
          ))}
        </div>
      </section>

      <button className="danger" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
    </div>
  );
}
