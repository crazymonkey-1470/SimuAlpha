// Turn what a person pastes into a feed URL.
//   YouTube: channel link, @handle, /channel/UC… or a feeds/videos.xml URL
//   Podcast: show name, Apple Podcasts link, or the RSS URL itself

const YT_FEED = (id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;

/** @param {string} input @param {(url: string) => Promise<string>} fetchText */
export async function resolveYouTube(input, fetchText) {
  const s = String(input ?? '').trim();
  const direct = s.match(/[?&]channel_id=(UC[\w-]{22})/) ?? s.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
  if (direct) return { url: YT_FEED(direct[1]) };
  const page = /^https?:\/\//i.test(s) ? s : `https://www.youtube.com/${s.startsWith('@') ? s : '@' + s}`;
  const html = await fetchText(page);
  // The page mentions many channel IDs (recommendations); only the canonical one is this channel.
  const id =
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ??
    html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/)?.[1] ??
    html.match(/"externalId":"(UC[\w-]{22})"/)?.[1];
  if (!id) throw new Error(`Could not find the YouTube channel for ${s}`);
  return { url: YT_FEED(id), name: html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] };
}

/** @param {string} input @param {(url: string) => Promise<any>} fetchJson */
export async function resolvePodcast(input, fetchJson) {
  const s = String(input ?? '').trim();
  const appleId = s.match(/podcasts\.apple\.com\/.*\bid(\d+)/)?.[1];
  if (/^https?:\/\//i.test(s) && !appleId && !/itunes\.apple\.com\/search/i.test(s)) return { url: s };
  const term = appleId ? null : decodeURIComponent(s.match(/[?&]term=([^&]+)/)?.[1] ?? s).replace(/\+/g, ' ');
  const api = appleId
    ? `https://itunes.apple.com/lookup?id=${appleId}&entity=podcast`
    : `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=5&term=${encodeURIComponent(term)}`;
  const data = await fetchJson(api);
  const results = (data?.results ?? []).filter((r) => r.feedUrl);
  const exact = term && results.find((r) => r.collectionName?.toLowerCase() === term.toLowerCase());
  const hit = exact ?? results[0];
  if (!hit) throw new Error(`No podcast found for ${s}`);
  return { url: hit.feedUrl, name: hit.collectionName };
}
