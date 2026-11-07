import { useState } from 'react';
import { errorText, supabase } from '../supabase';
import { href, useApp, useLoad } from '../lib';
import type { Episode, QuoteCard as Quote, QuoteRole } from '../types';
import QuoteCard from './QuoteCard';

/** The episode's quote of the show, with opener/closer, swap and choose-from-bank. */
export default function ShowQuote({ ep }: { ep: Episode }) {
  const { reloadEpisodes } = useApp();
  const quote = useLoad<Quote>(
    () =>
      ep.quote_id
        ? supabase.from('quote_cards').select('*').eq('id', ep.quote_id).maybeSingle<Quote>()
        : Promise.resolve({ data: null, error: null }),
    [ep.quote_id],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const q = ep.quote_id ? quote.data : null;

  async function run(op: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setErr('');
    const { error } = await op;
    setBusy(false);
    if (error) return setErr(errorText(error));
    reloadEpisodes();
  }
  const setRole = (role: QuoteRole) => run(supabase.from('episodes').update({ quote_role: role }).eq('id', ep.id));

  return (
    <section className="show-quote" aria-labelledby={`quote-${ep.id}`}>
      <div className="show-quote-head">
        <h2 id={`quote-${ep.id}`}>Quote of the show</h2>
        <div className="segmented" role="radiogroup" aria-label="Where it goes">
          {(['opener', 'closer'] as const).map((r) => (
            <button key={r} role="radio" aria-checked={ep.quote_role === r} className={ep.quote_role === r ? 'on' : ''} disabled={busy} onClick={() => setRole(r)}>
              {r === 'opener' ? 'Opener' : 'Closer'}
            </button>
          ))}
        </div>
      </div>
      <p className="hint small">
        {ep.quote_role === 'opener' ? 'Read it at the top and let it start the conversation.' : 'Read it to close the show and send people off.'}
      </p>
      {q ? <QuoteCard q={q} /> : quote.loading && ep.quote_id ? <p className="muted">Loading…</p> : <p className="empty">No quote yet.</p>}
      <div className="actions">
        <button disabled={busy} onClick={() => run(supabase.rpc('swap_quote', { episode_id: ep.id }))}>
          {q ? 'Another quote' : 'Pick one for me'}
        </button>
        <a className="button" href={href('quotes', ep.id)}>
          Choose from the bank
        </a>
      </div>
      {err && <p className="error">{err}</p>}
    </section>
  );
}
