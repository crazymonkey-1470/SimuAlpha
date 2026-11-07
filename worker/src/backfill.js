// One-time history for a source: the last BACKFILL_DAYS of headlines, so the crew has a month to browse.
//
// 1. WordPress-style sites (most blogs and many newsrooms) page their feed: ?paged=2, 3, ...
// 2. Anything else, and feeds that come through Google News, use Google News search for that site,
//    one week at a time: "site:foxnews.com/politics after:2026-10-01 before:2026-10-08".
//    Google is asked one request at a time, a little apart, so the worker never hammers it.
import { parseFeed } from './parse.js';

export const BACKFILL_DAYS = 31;
const DAY = 86_400_000;
const MAX_PAGES = 12;
const MAX_ENTRIES = 400;
const GOOGLE_GAP_MS = 1500;
const FEED_ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5';
// Links on these hosts don't tell us the outlet's own site.
const SKIP_HOSTS = /(^|\.)(news\.google\.com|feedproxy\.google\.com|feeds\.feedburner\.com|youtube\.com|youtu\.be)$/i;
// First path segments too generic to narrow a site: search by host instead.
const GENERIC = new Set(['news', 'article', 'articles', 'story', 'stories', 'blog', 'blogs', 'post', 'posts', 'watch',
  'video', 'videos', 'live', 'en', 'us', 'uk', 'world', 'amp', 'content', 'feed', 'feeds', 'rss', 'p', 'a', 'id', 'item']);

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Google News RSS search for one site and date window. */
export function googleNewsUrl(site, after, before) {
  const q = `site:${site} after:${after} before:${before}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

/**
 * The site to search on Google News: from a Google News feed's own query, or from where the feed's links
 * point (host, narrowed to a section like foxnews.com/politics when nearly every link shares it).
 */
export function siteFor(feedUrl, entries) {
  let u;
  try {
    u = new URL(feedUrl);
  } catch {
    return null;
  }
  if (u.hostname === 'news.google.com') return (u.searchParams.get('q') ?? '').match(/site:(\S+)/)?.[1] ?? null;

  const hosts = new Map();
  const sections = new Map();
  let n = 0;
  for (const e of entries) {
    let x;
    try {
      x = new URL(e.url);
    } catch {
      continue;
    }
    if (SKIP_HOSTS.test(x.hostname)) continue;
    n++;
    const host = x.hostname.replace(/^www\./i, '').toLowerCase();
    hosts.set(host, (hosts.get(host) ?? 0) + 1);
    const seg = x.pathname.split('/')[1] ?? '';
    sections.set(`${host}/${seg}`, (sections.get(`${host}/${seg}`) ?? 0) + 1);
  }
  if (!n) return null;
  const [host, hostCount] = [...hosts].sort((a, b) => b[1] - a[1])[0];
  if (hostCount < n * 0.6) return null;
  const [section, sectionCount] = [...sections].sort((a, b) => b[1] - a[1])[0];
  const seg = section.slice(host.length + 1);
  if (section.startsWith(`${host}/`) && sectionCount >= n * 0.8 && /^[a-z][a-z-]{2,30}$/.test(seg) && !GENERIC.has(seg)) {
    return `${host}/${seg}`;
  }
  return host;
}

/** Older pages of a WordPress-style feed. Returns [] when the site ignores ?paged. */
export async function pagedHistory(feedUrl, kind, cutoff, seen, deps) {
  const out = [];
  for (let page = 2; page <= MAX_PAGES; page++) {
    const url = `${feedUrl}${feedUrl.includes('?') ? '&' : '?'}paged=${page}`;
    let entries;
    try {
      const res = await deps.get(url, { Accept: FEED_ACCEPT });
      if (!res.ok) break;
      ({ entries } = parseFeed(await res.text(), kind));
    } catch {
      break;
    }
    const fresh = entries.filter((e) => !seen.has(e.url));
    if (!fresh.length) break; // same page again (parameter ignored) or the archive ran out
    for (const e of fresh) seen.add(e.url);
    out.push(...fresh.filter((e) => !e.published_at || Date.parse(e.published_at) > cutoff));
    const dates = entries.map((e) => Date.parse(e.published_at)).filter(Number.isFinite);
    if (dates.length && Math.min(...dates) <= cutoff) break; // reached the start of the window
  }
  return out;
}

/** Google News, one week at a time, from `until` back to `cutoff`. Throws if Google refuses. */
export async function googleHistory(site, until, cutoff, deps) {
  const out = [];
  for (let end = until; end > cutoff; end -= 7 * DAY) {
    const start = Math.max(cutoff, end - 7 * DAY);
    const url = googleNewsUrl(site, ymd(start - DAY), ymd(end + DAY));
    const res = await deps.google(() => deps.get(url, { Accept: FEED_ACCEPT }));
    if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
    const { entries } = parseFeed(await res.text(), 'rss');
    out.push(...entries.filter((e) => e.published_at && Date.parse(e.published_at) > cutoff && Date.parse(e.published_at) <= until));
  }
  return out;
}

/** Serialises Google News requests with a gap between them (shared by every lane). */
export function googlePacer(gapMs = GOOGLE_GAP_MS) {
  let chain = Promise.resolve();
  return (fn) => {
    const run = chain.then(fn);
    chain = run.catch(() => {}).then(() => sleep(gapMs));
    return run;
  };
}

/**
 * History for one source. `live` is what the feed itself returned now.
 * Returns { entries, done, note }: done=false means try again on a later run.
 */
export async function backfill(src, feedUrl, live, deps, now = Date.now()) {
  const cutoff = now - BACKFILL_DAYS * DAY;
  if (src.kind !== 'rss') return { entries: [], done: true, note: 'feed history only' }; // YouTube / podcast feeds carry their own history

  const seen = new Set(live.map((e) => e.url));
  const isGoogle = /^https:\/\/news\.google\.com\//i.test(feedUrl);
  if (!isGoogle) {
    const paged = await pagedHistory(feedUrl, src.kind, cutoff, seen, deps);
    if (paged.length) return { entries: paged.slice(0, MAX_ENTRIES), done: true, note: `${paged.length} from older pages` };
  }

  const site = siteFor(feedUrl, live);
  if (!site) return { entries: [], done: true, note: 'no site to search' };
  if (deps.sitesDone?.has(site)) return { entries: [], done: true, note: `${site} already backfilled this run` };
  deps.sitesDone?.add(site);

  const dates = live.map((e) => Date.parse(e.published_at)).filter(Number.isFinite);
  const until = isGoogle || !dates.length ? now : Math.min(...dates);
  try {
    const found = (await googleHistory(site, until, cutoff, deps)).filter((e) => !seen.has(e.url));
    return { entries: found.slice(0, MAX_ENTRIES), done: true, note: `${found.length} via Google News (${site})` };
  } catch (e) {
    deps.sitesDone?.delete(site);
    return { entries: [], done: false, note: String(e.message ?? e) };
  }
}
