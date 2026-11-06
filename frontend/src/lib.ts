import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Episode, Profile, Topic } from './types';

// ---------------------------------------------------------------------------
// Hash router: #/t/news -> ['t', 'news']. Works on any static host.
// ---------------------------------------------------------------------------
let inAppNavigations = 0;

function parseHash(): string[] {
  return window.location.hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onChange = () => {
      inAppNavigations++;
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const href = (...parts: string[]) => '#/' + parts.map(encodeURIComponent).join('/');
export const navigate = (...parts: string[]) => {
  window.location.hash = href(...parts).slice(1);
};

/** history.back() after in-app navigation; Home when the page was opened directly from a link. */
export function goBack() {
  if (inAppNavigations > 0) window.history.back();
  else navigate();
}

/** Copy text; falls back to a hidden textarea for older iOS Safari. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// ---------------------------------------------------------------------------
// App-wide data
// ---------------------------------------------------------------------------
export interface AppData {
  session: Session;
  me: Profile;
  topics: Topic[];
  profiles: Map<string, Profile>;
  episodes: Episode[];
  reloadEpisodes: () => void;
  reloadProfiles: () => void;
}

export const AppContext = createContext<AppData | null>(null);

export function useApp(): AppData {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp outside AppContext');
  return ctx;
}

// ---------------------------------------------------------------------------
// Tiny async loader with reload()
// ---------------------------------------------------------------------------
export function useLoad<T>(
  load: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
  deps: unknown[],
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.resolve(load()).then(({ data, error }) => {
      if (!live) return;
      setData(data);
      setError(error ? error.message : null);
      setLoading(false);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, error, loading, reload };
}

// ---------------------------------------------------------------------------
// Dates. published_at / recording_date are plain dates (YYYY-MM-DD): parse as
// local dates so they never shift a day across time zones.
// ---------------------------------------------------------------------------
function parseDay(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function formatDay(d: string | null): string {
  if (!d) return '';
  const date = parseDay(d);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}

export function daysAgo(d: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - parseDay(d).getTime()) / 86_400_000);
}

export function freshness(d: string | null): string {
  if (!d) return '';
  const n = daysAgo(d);
  if (n < 0) return `in ${-n}d`;
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 14) return `${n}d ago`;
  if (n < 60) return `${Math.round(n / 7)}w ago`;
  if (n < 730) return `${Math.round(n / 30)}mo ago`;
  return `${Math.round(n / 365)}y ago`;
}

export function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
