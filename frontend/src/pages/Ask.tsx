import { useState, type FormEvent } from 'react';
import { errorText, supabase } from '../supabase';
import { Armillary, LozengeRule } from '../components/Icons';

/** Public page (no sign-in): listeners send a question for the show's mailbag. */
export default function Ask() {
  const [question, setQuestion] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState(''); // honeypot: people never see or fill this
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.rpc('submit_question', {
      question: question.trim(),
      name: name.trim() || null,
      location: location.trim() || null,
      website: website || null,
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setSent(true);
  }

  return (
    <div className="centered ask-page">
      <Armillary />
      <h1 className="wordmark-hero">TRUE·ADAM</h1>
      <LozengeRule width={180} />
      {sent ? (
        <>
          <h2>Thank you</h2>
          <p>Your question is in the mailbag. If we use it, you’ll hear it on the show.</p>
          <button
            onClick={() => {
              setQuestion('');
              setSent(false);
            }}
          >
            Ask another
          </button>
        </>
      ) : (
        <>
          <h2>Ask the show</h2>
          <p className="tagline">
            Got a question for Freddy, Stew and Mike? Faith, family, work, money, fitness: send it in and we may answer
            it on the podcast.
          </p>
          <form onSubmit={submit} className="stack ask-form">
            <label>
              Your question
              <textarea rows={5} required minLength={5} maxLength={800} value={question} onChange={(e) => setQuestion(e.target.value)} />
              <span className="muted small">{question.length}/800</span>
            </label>
            <label>
              First name (optional)
              <input value={name} maxLength={80} autoComplete="given-name" onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Where you’re from (optional)
              <input value={location} maxLength={80} onChange={(e) => setLocation(e.target.value)} />
            </label>
            <label className="hp" aria-hidden="true">
              Website
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
            <button className="primary" disabled={busy || question.trim().length < 5}>
              {busy ? 'Sending…' : 'Send question'}
            </button>
            {err && <p className="error">{err}</p>}
          </form>
          <p className="muted small">We only keep what you type here. No account, no email address.</p>
        </>
      )}
    </div>
  );
}
