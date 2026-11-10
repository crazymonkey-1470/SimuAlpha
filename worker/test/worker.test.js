import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlToText, parseDuration, parseFeed } from '../src/parse.js';
import { resolvePodcast, resolveYouTube } from '../src/resolve.js';
import { pullSource, reportInChunks } from '../src/run.js';

const fixture = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

test('YouTube channel feed (real BibleProject feed): videos only, Shorts skipped, views + thumbnails', () => {
  const { title, entries } = parseFeed(fixture('youtube-bibleproject.xml'), 'youtube');
  assert.equal(title, 'BibleProject');
  assert.ok(entries.length > 0);
  assert.ok(entries.every((e) => e.media_type === 'video' && /youtube\.com\/watch\?v=/.test(e.url)));
  assert.ok(entries.every((e) => !e.url.includes('/shorts/')));
  assert.ok(entries.every((e) => Number.isInteger(e.views) && e.thumbnail_url?.startsWith('https://')));
  assert.ok(entries.every((e) => e.published_at && !Number.isNaN(Date.parse(e.published_at))));
});

test('Podcast feed (real Art of Manliness feed): episodes with audio, duration and plain-text notes', () => {
  const { title, entries } = parseFeed(fixture('podcast-art-of-manliness.xml'), 'podcast');
  assert.equal(title, 'The Art of Manliness');
  assert.equal(entries.length, 5);
  for (const e of entries) {
    assert.equal(e.media_type, 'podcast');
    assert.match(e.media_url, /^https:\/\//);
    assert.ok(e.duration_seconds > 60);
    assert.ok(e.preview && !/<[a-z]/i.test(e.preview), 'preview is plain text');
  }
  assert.equal(entries[0].duration_seconds, parseDuration('00:51:51'));
});

test('Plain RSS with CDATA, entities, dc:date and Atom-style links', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
    <title>Wire &amp; Co</title><atom:link href="https://wire.example.org/rss" rel="self"/>
    <item><title>Men &amp; church: a &#8220;quiet revival&#8221;</title><link>https://wire.example.org/a</link>
      <description><![CDATA[<p>Gen Z men&nbsp;attend <b>more</b>.</p>]]></description><dc:date>2026-11-06T10:00:00Z</dc:date></item>
    <item><title></title><link>https://wire.example.org/empty</link></item>
  </channel></rss>`;
  const { title, entries } = parseFeed(xml, 'rss');
  assert.equal(title, 'Wire & Co');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Men & church: a “quiet revival”');
  assert.equal(entries[0].preview, 'Gen Z men attend more .');
  assert.equal(entries[0].media_type, 'article');
  assert.equal(entries[0].published_at, '2026-11-06T10:00:00.000Z');
});

test('Not a feed throws', () => {
  assert.throws(() => parseFeed('<html><body>hi</body></html>'), /Not an RSS\/Atom feed/);
});

test('htmlToText and parseDuration', () => {
  assert.equal(htmlToText('<p>A&nbsp;&amp;&#160;B &#x2014; C</p>'), 'A & B — C');
  assert.equal(parseDuration('1:02:03'), 3723);
  assert.equal(parseDuration('45:10'), 2710);
  assert.equal(parseDuration('3600'), 3600);
  assert.equal(parseDuration('soon'), null);
});

test('YouTube resolver uses the canonical channel, not the first channelId on the page', async () => {
  const page = `..."channelId":"UCJjTpZCiHTd9lqYWsWge1_g"...<link rel="canonical" href="https://www.youtube.com/channel/UCVfwlh9XpX2Y_tQfjeln9QA">
    <meta property="og:title" content="BibleProject">`;
  let asked = '';
  const r = await resolveYouTube('@bibleproject', async (u) => ((asked = u), page));
  assert.equal(asked, 'https://www.youtube.com/@bibleproject');
  assert.equal(r.url, 'https://www.youtube.com/feeds/videos.xml?channel_id=UCVfwlh9XpX2Y_tQfjeln9QA');
  assert.equal(r.name, 'BibleProject');
  const direct = await resolveYouTube('https://www.youtube.com/channel/UC22BdTgxefuvUivrjesETjg', async () => assert.fail('no fetch'));
  assert.match(direct.url, /channel_id=UC22BdTgxefuvUivrjesETjg$/);
});

test('Podcast resolver: name search prefers the exact title; Apple links use lookup; RSS passes through', async () => {
  const calls = [];
  const fake = async (u) => {
    calls.push(u);
    return { results: [
      { collectionName: 'Ask Pastor John in Khmer', feedUrl: 'https://feeds.acast.com/x' },
      { collectionName: 'Ask Pastor John', feedUrl: 'https://feed.desiringgod.org/ask-pastor-john.rss' },
    ] };
  };
  assert.equal((await resolvePodcast('Ask Pastor John', fake)).url, 'https://feed.desiringgod.org/ask-pastor-john.rss');
  await resolvePodcast('https://podcasts.apple.com/us/podcast/the-rest-is-history/id1537788786', fake);
  assert.match(calls.at(-1), /lookup\?id=1537788786/);
  assert.equal((await resolvePodcast('https://feeds.megaphone.fm/hubermanlab', fake)).url, 'https://feeds.megaphone.fm/hubermanlab');
});

test('pullSource: conditional fetch (304), resolution report, HTTP errors', async () => {
  const resp = (status, body = '', headers = {}) => ({ status, ok: status >= 200 && status < 300, text: async () => body, headers: new Map(Object.entries(headers)) });
  let sentHeaders;
  const r304 = await pullSource(
    { kind: 'rss', url: 'https://x.example.org/rss', resolved: true, etag: '"v1"' },
    { get: async (_u, h) => ((sentHeaders = h), resp(304)) },
  );
  assert.equal(sentHeaders['If-None-Match'], '"v1"');
  assert.equal(r304.status, 304);
  assert.deepEqual(r304.entries, []);

  const pod = fixture('podcast-art-of-manliness.xml');
  const resolved = await pullSource(
    { kind: 'podcast', url: 'https://itunes.apple.com/search?media=podcast&term=art%20of%20manliness', input_url: 'The Art of Manliness', resolved: false },
    {
      fetchJson: async () => ({ results: [{ collectionName: 'The Art of Manliness', feedUrl: 'https://rss.art19.com/the-art-of-manliness' }] }),
      get: async () => resp(200, pod, { etag: '"abc"' }),
    },
  );
  assert.equal(resolved.url, 'https://rss.art19.com/the-art-of-manliness');
  assert.equal(resolved.etag, '"abc"');
  assert.ok(resolved.entries.length <= 5);

  const err = await pullSource({ kind: 'rss', url: 'https://x.example.org/gone', resolved: true }, { get: async () => resp(404) });
  assert.equal(err.error, 'HTTP 404');
});

// ---- Month backfill ----
import { backfill, googleNewsUrl, googlePacer, siteFor } from '../src/backfill.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-07T12:00:00Z');
const rssOf = (items) => `<?xml version="1.0"?><rss><channel><title>T</title>${items
  .map(([t, u, at]) => `<item><title>${t}</title><link>${u}</link><pubDate>${new Date(at).toUTCString()}</pubDate></item>`)
  .join('')}</channel></rss>`;
const ok = (body) => ({ status: 200, ok: true, text: async () => body, headers: new Map() });
const fail = (status) => ({ status, ok: false, text: async () => '', headers: new Map() });

test('siteFor: Google News query, section narrowing, host fallback, unusable links', () => {
  assert.equal(siteFor('https://news.google.com/rss/search?q=site:cnn.com+when:1d&hl=en-US&gl=US&ceid=US:en', []), 'cnn.com');
  const fox = ['a', 'b', 'c', 'd', 'e'].map((x) => ({ url: `https://www.foxnews.com/politics/${x}` }));
  assert.equal(siteFor('https://moxie.foxnews.com/google-publisher/politics.xml', fox), 'foxnews.com/politics');
  const mixed = ['us/a', 'world/b', 'politics/c', 'media/d'].map((x) => ({ url: `https://www.foxnews.com/${x}` }));
  assert.equal(siteFor('https://moxie.foxnews.com/google-publisher/latest.xml', mixed), 'foxnews.com');
  assert.equal(siteFor('https://feeds.bbci.co.uk/news/rss.xml', [{ url: 'https://www.bbc.com/news/articles/x' }, { url: 'https://www.bbc.com/news/articles/y' }]), 'bbc.com');
  assert.equal(siteFor('https://feeds.npr.org/1001/rss.xml', [{ url: 'https://www.npr.org/2026/11/07/a' }]), 'npr.org');
  assert.equal(siteFor('https://feeds.feedburner.com/x', [{ url: 'https://feedproxy.google.com/~r/x/1' }]), null);
  assert.match(googleNewsUrl('foxnews.com/politics', '2026-10-01', '2026-10-08'), /q=site%3Afoxnews\.com%2Fpolitics%20after%3A2026-10-01%20before%3A2026-10-08&hl=en-US/);
});

test('backfill: WordPress paging walks back a month and stops at the cutoff', async () => {
  const asked = [];
  const pages = {
    2: rssOf([['Ten days', 'https://blog.example.org/10', NOW - 10 * DAY], ['Twenty days', 'https://blog.example.org/20', NOW - 20 * DAY]]),
    3: rssOf([['28 days', 'https://blog.example.org/28', NOW - 28 * DAY], ['40 days', 'https://blog.example.org/40', NOW - 40 * DAY]]),
  };
  const deps = {
    get: async (u) => (asked.push(u), pages[u.match(/paged=(\d+)/)[1]] ? ok(pages[u.match(/paged=(\d+)/)[1]]) : fail(404)),
    google: async () => assert.fail('no Google needed for a paging site'),
  };
  const live = [{ url: 'https://blog.example.org/1', published_at: new Date(NOW - DAY).toISOString() }];
  const r = await backfill({ kind: 'rss' }, 'https://blog.example.org/feed/', live, deps, NOW);
  assert.equal(r.done, true);
  assert.deepEqual(r.entries.map((e) => e.url), ['https://blog.example.org/10', 'https://blog.example.org/20', 'https://blog.example.org/28']);
  assert.deepEqual(asked, ['https://blog.example.org/feed/?paged=2', 'https://blog.example.org/feed/?paged=3']);
});

test('backfill: a site that ignores paging falls back to Google News, a week at a time, once per site per run', async () => {
  const live = ['a', 'b', 'c'].map((x, i) => ({ url: `https://www.foxnews.com/politics/${x}`, published_at: new Date(NOW - i * 3_600_000).toISOString() }));
  const liveXml = rssOf(live.map((e) => ['Live', e.url, Date.parse(e.published_at)]));
  const googleAsked = [];
  let week = 0;
  const deps = {
    get: async (u) => {
      if (u.includes('paged=')) return ok(liveXml); // parameter ignored: same items again
      googleAsked.push(u);
      week++;
      return ok(rssOf([[`Week ${week} story - Fox News`, `https://news.google.com/rss/articles/w${week}`, NOW - (week * 7 - 3) * DAY],
                       ['Too old', `https://news.google.com/rss/articles/old${week}`, NOW - 60 * DAY]]));
    },
    google: googlePacer(0),
    sitesDone: new Set(),
  };
  const r = await backfill({ kind: 'rss' }, 'https://moxie.foxnews.com/google-publisher/politics.xml', live, deps, NOW);
  assert.equal(r.done, true);
  assert.equal(googleAsked.length, 5, '31 days = 5 weekly windows');
  assert.ok(googleAsked.every((u) => u.includes(encodeURIComponent('site:foxnews.com/politics after:'))));
  assert.equal(r.entries.length, 4, 'one story per window inside the month; the 32-day one and 60-day ones are dropped');
  assert.ok(r.entries.every((e) => Date.parse(e.published_at) > NOW - 31 * DAY));

  const again = await backfill({ kind: 'rss' }, 'https://moxie.foxnews.com/google-publisher/politics.xml', live, deps, NOW);
  assert.equal(again.entries.length, 0);
  assert.match(again.note, /already searched this run/);
  assert.equal(googleAsked.length, 5, 'no second round of Google requests for the same site');
});

test('backfill: Google refusing leaves the source for a later run; YouTube and podcasts use their own history', async () => {
  const deps = { get: async () => fail(503), google: googlePacer(0), sitesDone: new Set() };
  const r = await backfill({ kind: 'rss' }, 'https://news.google.com/rss/search?q=site:apnews.com+when:1d', [], deps, NOW);
  assert.equal(r.done, false);
  assert.match(r.note, /503/);
  assert.equal(deps.sitesDone.has('apnews.com'), false, 'site can be retried');
  const yt = await backfill({ kind: 'youtube' }, 'https://www.youtube.com/feeds/videos.xml?channel_id=UCx', [], deps, NOW);
  assert.deepEqual([yt.done, yt.entries.length], [true, 0]);
});

test('pullSource with backfill: no conditional headers, month cutoff, history appended and flagged', async () => {
  const now = Date.now();
  let first;
  const deps = {
    get: async (u, h) => {
      if (!first) {
        first = h;
        return ok(rssOf([['Live CNN story - CNN', 'https://news.google.com/rss/articles/live', now - 3_600_000],
                         ['Twenty days ago - CNN', 'https://news.google.com/rss/articles/d20', now - 20 * DAY]]));
      }
      return ok(rssOf([[`Older ${u.length} - CNN`, `https://news.google.com/rss/articles/${encodeURIComponent(u.slice(-40))}`, now - 9 * DAY]]));
    },
    google: googlePacer(0),
    sitesDone: new Set(),
  };
  const r = await pullSource({ kind: 'rss', url: 'https://news.google.com/rss/search?q=site:cnn.com+when:1d', resolved: true, etag: '"v1"', backfill: true }, deps);
  assert.equal(first['If-None-Match'], undefined, 'backfill fetches the full feed');
  assert.equal(r.backfilled, true);
  assert.ok(r.entries.some((e) => e.url.endsWith('/d20')), '20-day-old live item kept during backfill');
  assert.ok(r.entries.length >= 3);
  const normal = await pullSource({ kind: 'rss', url: 'https://x.example.org/rss', resolved: true },
    { get: async () => ok(rssOf([['Old', 'https://x.example.org/old', now - 20 * DAY], ['New', 'https://x.example.org/new', now - DAY]])) });
  assert.deepEqual(normal.entries.map((e) => e.url), ['https://x.example.org/new'], 'normal runs keep the 14-day window');
  assert.equal(normal.backfilled, undefined);
});

test('backfill: a stray old item in the feed does not push the Google search outside the month', async () => {
  const live = [
    { url: 'https://www.npr.org/2026/11/07/a', published_at: new Date(NOW - 3_600_000).toISOString() },
    { url: 'https://www.npr.org/2019/01/01/evergreen', published_at: new Date(NOW - 2000 * DAY).toISOString() },
  ];
  const googleAsked = [];
  const deps = {
    get: async (u) => {
      if (u.includes('paged=')) return fail(404);
      googleAsked.push(u);
      return ok(rssOf([[`Story ${googleAsked.length} - NPR`, `https://news.google.com/rss/articles/n${googleAsked.length}`, NOW - (googleAsked.length * 7 - 3) * DAY]]));
    },
    google: googlePacer(0),
    sitesDone: new Set(),
  };
  const r = await backfill({ kind: 'rss' }, 'https://feeds.npr.org/1001/rss.xml', live, deps, NOW);
  assert.equal(googleAsked.length, 5, 'searches the whole month');
  assert.equal(r.entries.length, 4);
});

test('backfill: archive pages that stop short of a month are topped up from Google News', async () => {
  const live = [{ url: 'https://wp.example.org/new', published_at: new Date(NOW - DAY).toISOString() }];
  const googleAsked = [];
  const deps = {
    get: async (u) => {
      if (u.endsWith('paged=2')) return ok(rssOf([['Five days', 'https://wp.example.org/5', NOW - 5 * DAY], ['Six days', 'https://wp.example.org/6', NOW - 6 * DAY]]));
      if (u.includes('paged=')) return fail(404);
      googleAsked.push(u);
      return ok(rssOf([[`Older ${googleAsked.length}`, `https://news.google.com/rss/articles/o${googleAsked.length}`, NOW - (6 + googleAsked.length * 5) * DAY]]));
    },
    google: googlePacer(0),
    sitesDone: new Set(),
  };
  const r = await backfill({ kind: 'rss' }, 'https://wp.example.org/feed/', live, deps, NOW);
  assert.ok(googleAsked.length >= 4, 'Google picks up where the pages stopped');
  assert.ok(googleAsked[0].includes(encodeURIComponent('site:wp.example.org')));
  assert.ok(r.entries.some((e) => e.url === 'https://wp.example.org/6'), 'paged items kept');
  assert.ok(r.entries.some((e) => e.url.startsWith('https://news.google.com/')), 'Google items added');
  assert.match(r.note, /2 from older pages \+ \d+ via Google News/);
});

test('reportInChunks: small chunks, append flags, backfilled only on the last call, timeouts split and retried', async () => {
  const calls = [];
  const send = async (r) => {
    if (r.entries.length > 15) throw new Error('worker_report failed (500): {"code":"57014","message":"canceling statement due to statement timeout"}');
    calls.push({ n: r.entries.length, append: r.append, backfilled: r.backfilled });
    return r.entries.length;
  };
  const entries = Array.from({ length: 70 }, (_, i) => ({ url: `https://x.example.org/${i}` }));
  const added = await reportInChunks(send, { status: 200, entries, backfilled: true }, 40);
  assert.equal(added, 70, 'every entry sent once');
  assert.ok(calls.every((c) => c.n <= 15), 'timed-out chunks were split');
  assert.equal(calls[0].append, false);
  assert.ok(calls.slice(1).every((c) => c.append === true));
  assert.deepEqual(calls.map((c) => c.backfilled).filter(Boolean), [true], 'only the final call marks the backfill done');
  assert.equal(calls.at(-1).backfilled, true);
  const other = async () => { throw new Error('worker_report failed (500): boom'); };
  await assert.rejects(reportInChunks(other, { status: 200, entries }), /boom/, 'other errors are not retried');
  const empty = [];
  await reportInChunks(async (r) => (empty.push(r), 0), { status: 304, entries: [] });
  assert.equal(empty.length, 1, 'a report with no entries still records the fetch');
});

test('resolvePodcast: a show name with a literal % is searched as typed', async () => {
  let asked = '';
  const r = await resolvePodcast('100% Fed Up', async (u) => ((asked = u), { results: [{ collectionName: '100% Fed Up', feedUrl: 'https://feeds.example.org/fedup' }] }));
  assert.equal(r.url, 'https://feeds.example.org/fedup');
  assert.match(asked, /term=100%25%20Fed%20Up$/);
  const enc = await resolvePodcast('https://itunes.apple.com/search?media=podcast&term=Dan%20Snow%27s%20History+Hit', async (u) => ((asked = u), { results: [{ collectionName: "Dan Snow's History Hit", feedUrl: 'https://feeds.example.org/hh' }] }));
  assert.equal(enc.url, 'https://feeds.example.org/hh', 'encoded search URLs still decode');
});
