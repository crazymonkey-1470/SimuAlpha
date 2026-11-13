import { useEffect, useState, type FormEvent } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { errorText, supabase } from '../supabase';
import { formatDay, goBack, href, navigate, useApp } from '../lib';
import { CONTACT_LABEL, ITEM_TYPES, type ContactStatus, type CoveredRow, type ItemCard, type ItemStatus, type ItemType } from '../types';

interface FormState {
  item_type: ItemType;
  title: string;
  url: string;
  source: string;
  published_at: string;
  summary: string;
  talking_points: string;
  quote: string;
  topics: string[];
  status: ItemStatus;
  guest_name: string;
  why_them: string;
  contact_status: ContactStatus | '';
}

const AUTO_TOPIC: Partial<Record<ItemType, string>> = { fun_fact: 'fun-facts', guest_idea: 'guests' };

const blank = (topic?: string): FormState => ({
  item_type: 'article',
  title: '',
  url: '',
  source: '',
  published_at: '',
  summary: '',
  talking_points: '',
  quote: '',
  topics: topic ? [topic] : [],
  status: 'inbox',
  guest_name: '',
  why_them: '',
  contact_status: '',
});

const fromItem = (i: ItemCard): FormState => ({
  item_type: i.item_type,
  title: i.title,
  url: i.url ?? '',
  source: i.source ?? '',
  published_at: i.published_at ?? '',
  summary: i.summary ?? '',
  talking_points: i.talking_points.join('\n'),
  quote: i.quote ?? '',
  topics: i.topics,
  status: i.status,
  guest_name: i.guest_name ?? '',
  why_them: i.why_them ?? '',
  contact_status: i.contact_status ?? '',
});

const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** Accepts "example.com/x", "https://…", or pasted text that contains a link. */
export function cleanUrl(raw: string): string | null {
  const u = raw.trim();
  if (!u) return null;
  const found = u.match(/https?:\/\/[^\s<>"]+/i);
  if (found) return found[0].replace(/[).,;]+$/, '');
  return /^[^\s/]+\.[^\s]+$/.test(u) ? `https://${u}` : u; // anything else: let the database explain
}

export default function ItemForm({ id, defaultTopic }: { id?: string; defaultTopic?: string }) {
  const { topics } = useApp();
  const [form, setForm] = useState<FormState | null>(id ? null : blank(defaultTopic));
  const [original, setOriginal] = useState<ItemCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; existingId?: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('item_cards')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return setErr({ text: error ? errorText(error) : 'Item not found.' });
        setOriginal(data as ItemCard);
        setForm(fromItem(data as ItemCard));
      });
  }, [id]);

  // "Covered before?": similar items already in the prep room or aired, and when the story first hit the news.
  const [covered, setCovered] = useState<CoveredRow[]>([]);
  const title = form?.title ?? '';
  const link = form?.url ?? '';
  useEffect(() => {
    if (title.trim().length < 12 && !link.trim()) return setCovered([]);
    let live = true;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.rpc('covered_before', { title: title.trim(), url: cleanUrl(link), exclude: id ?? null });
      if (live) setCovered((data ?? []) as CoveredRow[]);
    }, 700);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [title, link, id]);

  if (!form) return err ? <p className="error">{err.text}</p> : <p className="muted">Loading…</p>;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f!, [k]: v }));
  const toggleTopic = (slug: string) =>
    set('topics', form.topics.includes(slug) ? form.topics.filter((t) => t !== slug) : [...form.topics, slug]);
  const setType = (t: ItemType) => {
    const auto = AUTO_TOPIC[t];
    setForm((f) => ({ ...f!, item_type: t, topics: auto && !f!.topics.includes(auto) ? [...f!.topics, auto] : f!.topics }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form || !form.title.trim()) return setErr({ text: 'Title is required.' });
    setBusy(true);
    setErr(null);

    const fields = {
      title: form.title.trim(),
      url: cleanUrl(form.url),
      source: orNull(form.source),
      published_at: form.published_at || null,
      summary: orNull(form.summary),
      talking_points: form.talking_points.split('\n').map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, '').trim()).filter(Boolean),
      quote: orNull(form.quote),
      item_type: form.item_type,
      guest_name: form.item_type === 'guest_idea' ? orNull(form.guest_name) : null,
      why_them: form.item_type === 'guest_idea' ? orNull(form.why_them) : null,
      contact_status: form.item_type === 'guest_idea' && form.contact_status ? form.contact_status : null,
    };

    let error: PostgrestError | null = null;
    let itemId = id;
    if (!id) {
      const res = await supabase.rpc('add_item', { ...fields, status: form.status, topics: form.topics });
      error = res.error;
      itemId = res.data as string;
    } else {
      ({ error } = await supabase.from('items').update(fields).eq('id', id));
      const before = original?.topics ?? [];
      const removed = before.filter((t) => !form.topics.includes(t));
      const added = form.topics.filter((t) => !before.includes(t));
      if (!error && removed.length)
        ({ error } = await supabase.from('item_topics').delete().eq('item_id', id).in('topic_slug', removed));
      if (!error && added.length)
        ({ error } = await supabase
          .from('item_topics')
          .upsert(added.map((topic_slug) => ({ item_id: id, topic_slug })), { ignoreDuplicates: true }));
    }
    setBusy(false);

    if (error) {
      const existingId = error.code === '23505' && /^[0-9a-f-]{36}$/.test(error.details ?? '') ? error.details! : undefined;
      return setErr({ text: errorText(error), existingId });
    }
    navigate('i', itemId!);
  }

  async function remove() {
    if (!id || !confirm('Delete this item for everyone? (Archive is usually better.)')) return;
    setBusy(true);
    const { error } = await supabase.from('items').delete().eq('id', id);
    setBusy(false);
    if (error) return setErr({ text: errorText(error) });
    navigate();
  }

  const isGuest = form.item_type === 'guest_idea';

  return (
    <form className="item-form" onSubmit={submit}>
      <h1>{id ? 'Edit item' : 'Add an item'}</h1>
      {!id && <p className="hint">Found something worth talking about? Drop it here. Write the summary in your own words.</p>}

      <div className="type-picker" role="radiogroup" aria-label="Type">
        {ITEM_TYPES.map((t) => (
          <button
            type="button"
            key={t.value}
            role="radio"
            aria-checked={form.item_type === t.value}
            className={form.item_type === t.value ? 'on' : ''}
            onClick={() => setType(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <label>
        Title *
        <input required value={form.title} onChange={(e) => set('title', e.target.value)} />
      </label>
      <label>
        Link
        <input
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://… (or just paste the link)"
          value={form.url}
          onChange={(e) => set('url', e.target.value)}
        />
      </label>
      <div className="row">
        <label>
          Source
          <input placeholder="NYT, YouTube, …" value={form.source} onChange={(e) => set('source', e.target.value)} />
        </label>
        <label>
          Published
          <input type="date" value={form.published_at} onChange={(e) => set('published_at', e.target.value)} />
        </label>
      </div>

      {isGuest && (
        <fieldset className="guest-fields">
          <legend>Guest</legend>
          <label>
            Guest name
            <input value={form.guest_name} onChange={(e) => set('guest_name', e.target.value)} />
          </label>
          <label>
            Why them?
            <textarea rows={2} value={form.why_them} onChange={(e) => set('why_them', e.target.value)} />
          </label>
          <label>
            Contact status
            <select value={form.contact_status} onChange={(e) => set('contact_status', e.target.value as ContactStatus | '')}>
              <option value="">—</option>
              {Object.entries(CONTACT_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
        </fieldset>
      )}

      <label>
        {form.item_type === 'topic_idea' ? 'Why cover it?' : 'Summary'}{' '}
        <span className="muted">{form.item_type === 'topic_idea' ? '(the angle, the hook)' : '(2–5 sentences)'}</span>
        <textarea rows={4} value={form.summary} onChange={(e) => set('summary', e.target.value)} />
      </label>
      <label>
        Talking points <span className="muted">(one per line: questions or angles for the mics)</span>
        <textarea rows={4} value={form.talking_points} onChange={(e) => set('talking_points', e.target.value)} />
      </label>
      <label>
        Pull quote <span className="muted">(optional)</span>
        <textarea rows={2} value={form.quote} onChange={(e) => set('quote', e.target.value)} />
      </label>

      <div className="field">
        <span>Topics</span>
        <div className="chips pick">
          {topics.map((t) => (
            <button
              type="button"
              key={t.slug}
              className={'chip ' + (form.topics.includes(t.slug) ? 'on' : '')}
              aria-pressed={form.topics.includes(t.slug)}
              onClick={() => toggleTopic(t.slug)}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {!id && (
        <label className="check">
          <input
            type="checkbox"
            checked={form.status === 'this_week'}
            onChange={(e) => set('status', e.target.checked ? 'this_week' : 'inbox')}
          />
          Nominate for this week
        </label>
      )}

      {covered.length > 0 && (
        <div className={`covered ${covered.some((c) => c.kind !== 'news') ? 'warn-box' : ''}`} role="status">
          <b>{covered.some((c) => c.kind === 'aired') ? 'You may have covered this already' : covered.some((c) => c.kind === 'prep') ? 'Something like this is already in the prep room' : 'This story in the news'}</b>
          <ul>
            {covered.map((c) => (
              <li key={c.kind + c.id}>
                {c.kind === 'news' ? (
                  c.link ? <a href={c.link} target="_blank" rel="noopener noreferrer">{c.title}</a> : c.title
                ) : (
                  <a href={href('i', c.id)}>{c.title}</a>
                )}
                <span className="muted">
                  {' '}· {c.detail}
                  {c.kind !== 'news' ? ` · ${formatDay(c.seen)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {err && (
        <p className="error">
          {err.text} {err.existingId && <a href={href('i', err.existingId)}>Open the existing item →</a>}
        </p>
      )}

      <div className="actions">
        <button className="primary" disabled={busy}>
          {busy ? 'Saving…' : id ? 'Save changes' : 'Add item'}
        </button>
        <button type="button" onClick={goBack}>
          Cancel
        </button>
        {id && (
          <button type="button" className="danger" disabled={busy} onClick={remove}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
