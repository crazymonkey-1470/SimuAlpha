import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../supabase';
import { useApp, useLoad } from '../lib';
import type { ItemCard } from '../types';
import ItemList from '../components/ItemList';

export default function Picks() {
  const { me } = useApp();
  const [mineOnly, setMineOnly] = useState(false);

  const picks = useLoad(() => {
    let q = supabase.from('item_cards').select('*').in('status', ['inbox', 'this_week']).gt('highlight_count', 0);
    if (mineOnly) q = q.contains('highlighted_by', [me.id]);
    return q
      .order('highlight_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
  }, [mineOnly]);
  const pitches = useLoad(
    () =>
      supabase
        .from('item_cards')
        .select('*')
        .eq('item_type', 'topic_idea')
        .in('status', ['inbox', 'this_week'])
        .order('highlight_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100),
    [],
  );
  const reload = () => {
    picks.reload();
    pitches.reload();
  };

  return (
    <>
      <h1>
        Crew <em>picks</em>
      </h1>
      <p className="hint">Tap the star on anything you’d want to talk about. The most-starred rise to the top.</p>

      <PitchForm onDone={reload} />

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={!mineOnly} className={!mineOnly ? 'on' : ''} onClick={() => setMineOnly(false)}>
          Everyone's stars
        </button>
        <button role="tab" aria-selected={mineOnly} className={mineOnly ? 'on' : ''} onClick={() => setMineOnly(true)}>
          My stars
        </button>
      </div>
      <ItemList
        items={picks.data as ItemCard[] | null}
        loading={picks.loading}
        error={picks.error}
        onChange={reload}
        empty={mineOnly ? 'You haven’t starred anything yet.' : 'No stars yet. Tap the star on an article you like.'}
      />

      <h2>
        <span>
          Topic <em>pitches</em>
        </span>{' '}
        <span className="count">{(pitches.data as ItemCard[] | null)?.length ?? ''}</span>
      </h2>
      <ItemList
        items={pitches.data as ItemCard[] | null}
        loading={pitches.loading}
        error={pitches.error}
        onChange={reload}
        empty="No pitches yet. Use the box above to pitch a topic."
      />
    </>
  );
}

function PitchForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc('add_item', {
      title: title.trim(),
      summary: why.trim() || null,
      item_type: 'topic_idea',
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setTitle('');
    setWhy('');
    setErr('');
    setOpen(false);
    onDone();
  }

  return (
    <form className="pitch-form" onSubmit={submit}>
      <input
        placeholder="Pitch a topic we should cover…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onFocus={() => setOpen(true)}
        aria-label="Topic to pitch"
      />
      {open && (
        <>
          <textarea rows={2} placeholder="Why it matters (optional)" value={why} onChange={(e) => setWhy(e.target.value)} />
          <div className="actions">
            <button className="primary" disabled={busy || !title.trim()}>
              {busy ? 'Saving…' : 'Pitch it'}
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </>
      )}
      {err && <p className="error">{err}</p>}
    </form>
  );
}
