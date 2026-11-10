import { useMemo, useState, type FormEvent } from 'react';
import { errorText, supabase } from '../supabase';
import { formatDay, freshness, href, navigate, today, useApp, useLoad } from '../lib';
import {
  AVAILABILITY_LABEL,
  EPISODE_STATUS_LABEL,
  type Availability,
  type AvailabilityStatus,
  type Episode,
  type Profile,
} from '../types';
import { ArrowIcon, BackIcon } from '../components/Icons';

const STATUSES: AvailabilityStatus[] = ['free', 'maybe', 'busy'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Every day shown for a month: whole weeks, Sunday first. */
function monthGrid(first: Date): string[] {
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate() + (6 - last.getDay()));
  const days: string[] = [];
  for (let d = start; d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(ymd(d));
  return days;
}

export default function Episodes() {
  const { episodes, reloadEpisodes, me, profiles } = useApp();
  const now = today();
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selected, setSelected] = useState(now);
  const grid = useMemo(() => monthGrid(month), [month]);
  const from = grid[0];
  const to = grid[grid.length - 1];

  const avail = useLoad<Availability[]>(
    () => supabase.from('availability').select('member_id, day, status, note').gte('day', from).lte('day', to),
    [from, to],
  );
  const links = useLoad(() => supabase.from('item_episodes').select('episode_id'), [episodes]);
  const counts = new Map<string, number>();
  for (const l of (links.data ?? []) as { episode_id: string }[]) counts.set(l.episode_id, (counts.get(l.episode_id) ?? 0) + 1);

  const crew = [...profiles.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const byDay = new Map<string, Map<string, Availability>>();
  for (const a of avail.data ?? []) {
    if (!byDay.has(a.day)) byDay.set(a.day, new Map());
    byDay.get(a.day)!.set(a.member_id, a);
  }
  const epsByDay = new Map<string, Episode[]>();
  for (const e of episodes) {
    if (!e.recording_date) continue;
    if (!epsByDay.has(e.recording_date)) epsByDay.set(e.recording_date, []);
    epsByDay.get(e.recording_date)!.push(e);
  }
  const allFree = (day: string) => crew.length > 0 && crew.every((p) => byDay.get(day)?.get(p.id)?.status === 'free');

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const goToday = () => {
    const n = new Date();
    setMonth(new Date(n.getFullYear(), n.getMonth(), 1));
    setSelected(now);
  };
  const pick = (day: string) => {
    setSelected(day);
    const d = localDate(day);
    if (d.getMonth() !== month.getMonth()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    // On phones the day's details sit below the calendar: bring them into view.
    if (window.matchMedia('(max-width: 640px)').matches)
      requestAnimationFrame(() => document.getElementById('day-panel-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const unscheduled = episodes.filter((e) => !e.recording_date && e.status === 'planning');
  const done = episodes
    .filter((e) => e.status !== 'planning')
    .sort((a, b) => (b.recording_date ?? '').localeCompare(a.recording_date ?? ''));

  return (
    <>
      <div className="page-head">
        <h1>Episodes</h1>
        <a className="button" href={href('quotes')}>
          Quote bank
        </a>
      </div>

      <div className="cal-head">
        <button className="cal-nav" onClick={() => shift(-1)} aria-label="Previous month">
          <BackIcon size={18} />
        </button>
        <h2 className="cal-month" aria-live="polite">
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h2>
        <button className="cal-nav" onClick={() => shift(1)} aria-label="Next month">
          <ArrowIcon size={18} />
        </button>
        <button className="cal-today" onClick={goToday}>
          Today
        </button>
      </div>

      <div className="calendar" role="grid" aria-label="Episode calendar">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday" role="columnheader">
            <span className="long">{w}</span>
            <span className="short">{w[0]}</span>
          </div>
        ))}
        {grid.map((day) => {
          const d = localDate(day);
          const eps = epsByDay.get(day) ?? [];
          const marks = byDay.get(day);
          const free = allFree(day);
          const label = [
            d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
            ...eps.map((e) => `episode: ${e.title}`),
            ...crew.map((p) => `${p.display_name}: ${marks?.get(p.id)?.status ?? 'not set'}`),
          ].join(', ');
          return (
            <button
              key={day}
              role="gridcell"
              aria-selected={day === selected}
              aria-label={label}
              className={[
                'cal-day',
                d.getMonth() !== month.getMonth() && 'outside',
                day === now && 'today',
                day === selected && 'selected',
                day < now && 'past',
                free && 'all-free',
                eps.length > 0 && 'has-episode',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => pick(day)}
            >
              <span className="cal-num">{d.getDate()}</span>
              <span className="cal-dots" aria-hidden="true">
                {crew.map((p) => (
                  <i key={p.id} className={`dot ${marks?.get(p.id)?.status ?? 'unset'}`} />
                ))}
              </span>
              {eps.map((e) => (
                <span key={e.id} className={`cal-ep ep-${e.status}`} aria-hidden="true">
                  {e.title}
                </span>
              ))}
            </button>
          );
        })}
      </div>
      <p className="cal-legend" aria-hidden="true">
        <span><i className="dot free" /> Free</span>
        <span><i className="dot maybe" /> Maybe</span>
        <span><i className="dot busy" /> Busy</span>
        <span><i className="dot unset" /> Not set</span>
        <span><i className="swatch all-free" /> Everyone free</span>
      </p>
      {avail.error && <p className="error">{avail.error}</p>}

      <DayPanel
        key={selected}
        day={selected}
        crew={crew}
        me={me}
        marks={byDay.get(selected)}
        episodes={epsByDay.get(selected) ?? []}
        counts={counts}
        everyoneFree={allFree(selected)}
        onChange={() => {
          avail.reload();
          reloadEpisodes();
        }}
      />

      <h2>Not scheduled yet</h2>
      <NewEpisode onCreated={reloadEpisodes} />
      {unscheduled.length > 0 && (
        <div className="episode-list">
          {unscheduled.map((e) => (
            <EpisodeRow key={e.id} e={e} count={counts.get(e.id) ?? 0} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <>
          <h2>Recorded &amp; published</h2>
          <div className="episode-list">
            {done.map((e) => (
              <EpisodeRow key={e.id} e={e} count={counts.get(e.id) ?? 0} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function EpisodeRow({ e, count }: { e: Episode; count: number }) {
  return (
    <a className="episode-row" href={href('e', e.id)}>
      <div>
        <b>{e.title}</b>
        <span className="muted">
          {e.recording_date ? `${formatDay(e.recording_date)} (${freshness(e.recording_date)})` : 'No date yet'}
        </span>
      </div>
      <div className="right">
        <span className={`badge ep-${e.status}`}>{EPISODE_STATUS_LABEL[e.status]}</span>
        <span className="muted">{count} items</span>
      </div>
    </a>
  );
}

/** The selected day: its episodes, everyone's availability, set your own, plan an episode. */
function DayPanel(props: {
  day: string;
  crew: Profile[];
  me: Profile;
  marks: Map<string, Availability> | undefined;
  episodes: Episode[];
  counts: Map<string, number>;
  everyoneFree: boolean;
  onChange: () => void;
}) {
  const { day, crew, me, marks, episodes, counts, everyoneFree, onChange } = props;
  const mine = marks?.get(me.id);
  const [note, setNote] = useState(mine?.note ?? '');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const d = localDate(day);

  async function run(op: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setErr('');
    const { error } = await op;
    setBusy(false);
    if (error) return setErr(errorText(error));
    onChange();
  }
  const setStatus = (status: AvailabilityStatus) =>
    run(
      supabase
        .from('availability')
        .upsert({ member_id: me.id, day, status, note: note.trim() || null }, { onConflict: 'member_id,day' }),
    );
  const clear = () => run(supabase.from('availability').delete().eq('member_id', me.id).eq('day', day));
  const saveNote = () =>
    mine && run(supabase.from('availability').update({ note: note.trim() || null }).eq('member_id', me.id).eq('day', day));

  async function plan(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setErr('');
    const { data, error } = await supabase
      .from('episodes')
      .insert({ title: title.trim(), recording_date: day })
      .select('id')
      .single();
    setBusy(false);
    if (error) return setErr(errorText(error));
    onChange();
    navigate('e', data.id);
  }

  return (
    <section className="day-panel" aria-labelledby="day-panel-title">
      <div className="day-panel-head">
        <h2 id="day-panel-title">
          {d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </h2>
        <span className="muted">{freshness(day)}</span>
        {everyoneFree && <span className="badge all-free-badge">Everyone free</span>}
      </div>

      {episodes.map((e) => (
        <a key={e.id} className="day-episode" href={href('e', e.id)}>
          <div>
            <span className="eyebrow">Recording</span>
            <b>{e.title}</b>
            <span className="muted">
              {EPISODE_STATUS_LABEL[e.status]} · {counts.get(e.id) ?? 0} items
            </span>
          </div>
          <span className="open">
            Open
            <ArrowIcon size={16} />
          </span>
        </a>
      ))}

      <h3>Who’s free</h3>
      <ul className="crew-availability">
        {crew.map((p) => {
          const a = marks?.get(p.id);
          return (
            <li key={p.id}>
              <i className={`dot ${a?.status ?? 'unset'}`} aria-hidden="true" />
              <b>{p.id === me.id ? `${p.display_name} (you)` : p.display_name}</b>
              <span className="muted">
                {a ? AVAILABILITY_LABEL[a.status] : 'Not set'}
                {a?.note ? ` · ${a.note}` : ''}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="my-availability">
        <span className="small">Your day:</span>
        <div className="segmented" role="radiogroup" aria-label="Your availability">
          {STATUSES.map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={mine?.status === s}
              className={`avail-${s} ${mine?.status === s ? 'on' : ''}`}
              disabled={busy}
              onClick={() => setStatus(s)}
            >
              {AVAILABILITY_LABEL[s]}
            </button>
          ))}
          {mine && (
            <button disabled={busy} onClick={clear}>
              Clear
            </button>
          )}
        </div>
        {mine && (
          <div className="note-row">
            <input
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional), e.g. after 3pm"
              aria-label="Availability note"
            />
            <button disabled={busy || (note.trim() || null) === (mine.note ?? null)} onClick={saveNote}>
              Save note
            </button>
          </div>
        )}
      </div>

      <form className="plan-form" onSubmit={plan}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`Plan an episode on ${formatDay(day)}`}
          aria-label="New episode title"
        />
        <button className="primary" disabled={busy || !title.trim()}>
          Plan episode
        </button>
      </form>
      {err && <p className="error">{err}</p>}
    </section>
  );
}

/** Create an episode without a date (it can be dated later on its page). */
function NewEpisode({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function create(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const { data, error } = await supabase.from('episodes').insert({ title: title.trim() }).select('id').single();
    setBusy(false);
    if (error) return setErr(errorText(error));
    onCreated();
    navigate('e', data.id);
  }
  return (
    <>
      <form className="plan-form" onSubmit={create}>
        <input placeholder="Episode idea (no date yet)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Episode idea" />
        <button disabled={busy || !title.trim()}>Add idea</button>
      </form>
      {err && <p className="error">{err}</p>}
    </>
  );
}
