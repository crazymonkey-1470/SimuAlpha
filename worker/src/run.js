// True Adam feed worker: runs on a Railway cron schedule, pulls every active source,
// and hands new headlines to Supabase through token-checked functions. Exits when done.
//
// Env: SUPABASE_URL, SUPABASE_KEY (publishable / anon key), INGEST_TOKEN (from the site's Sources page)
import { parseFeed } from './parse.js';
import { resolvePodcast, resolveYouTube } from './resolve.js';

const VERSION = 'worker-1.0.0';
const UA = 'TrueAdamPrep/1.0 (+https://simualpha.com) feed reader';
const MAX_AGE_DAYS = 14;
const CONCURRENCY = 5;

const env = (k) => {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`Missing environment variable ${k}`);
  return v;
};

export async function rpc(base, key, fn, args) {
  const res = await fetch(`${base.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${fn} failed (${res.status}): ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

async function get(url, headers = {}) {
  return fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers },
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  });
}
const fetchText = async (url) => {
  const r = await get(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
};
const fetchJson = async (url) => JSON.parse(await fetchText(url));

/** Fetch + parse one source and build the report for worker_report(). */
export async function pullSource(src, deps = { get, fetchText, fetchJson }) {
  const report = { version: VERSION, entries: [] };
  let feedUrl = src.url;
  if (!src.resolved) {
    const r = src.kind === 'youtube'
      ? await resolveYouTube(src.input_url ?? src.url, deps.fetchText)
      : await resolvePodcast(src.input_url ?? src.url, deps.fetchJson);
    feedUrl = r.url;
    report.url = r.url;
  }
  const conditional = src.resolved && feedUrl === src.url
    ? { ...(src.etag ? { 'If-None-Match': src.etag } : {}), ...(src.last_modified ? { 'If-Modified-Since': src.last_modified } : {}) }
    : {};
  const res = await deps.get(feedUrl, {
    Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
    ...conditional,
  });
  report.status = res.status;
  if (res.status === 304) return report;
  if (!res.ok) {
    report.error = `HTTP ${res.status}`;
    return report;
  }
  report.etag = res.headers.get('etag') ?? undefined;
  report.last_modified = res.headers.get('last-modified') ?? undefined;
  const { entries } = parseFeed(await res.text(), src.kind);
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  report.entries = entries.filter((e) => !e.published_at || Date.parse(e.published_at) > cutoff).slice(0, 60);
  return report;
}

async function main() {
  const base = env('SUPABASE_URL');
  const key = env('SUPABASE_KEY');
  const token = env('INGEST_TOKEN');
  const started = Date.now();
  const sources = await rpc(base, key, 'worker_sources', { token });
  console.log(`${VERSION}: ${sources.length} sources`);

  let added = 0, failed = 0, unchanged = 0;
  const queue = [...sources];
  async function lane() {
    for (let src = queue.shift(); src; src = queue.shift()) {
      let report;
      try {
        report = await pullSource(src);
      } catch (e) {
        report = { version: VERSION, status: 0, error: String(e.message ?? e).slice(0, 300), entries: [] };
      }
      try {
        const n = await rpc(base, key, 'worker_report', { token, feed_id: src.id, report });
        added += n;
        if (report.status === 304) unchanged++;
        if (report.error) failed++;
        console.log(`${report.error ? 'ERR' : 'ok '} ${src.kind.padEnd(7)} ${src.name}: ${report.error ?? `${report.status} +${n} new of ${report.entries.length}`}`);
      } catch (e) {
        failed++;
        console.error(`ERR report ${src.name}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, lane));
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s: +${added} new, ${unchanged} unchanged, ${failed} failed`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
