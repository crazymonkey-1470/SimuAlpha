import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlToText, parseDuration, parseFeed } from '../src/parse.js';
import { resolvePodcast, resolveYouTube } from '../src/resolve.js';
import { pullSource } from '../src/run.js';

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
