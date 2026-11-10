-- Three of the 2026-11-08 sources failed when fetched:
--   BarBend            HTTP 404 (no public feed at /feed/)          → Google News for barbend.com
--   The Penny Hoarder  "Not valid RSS/Atom" (a page, not a feed)    → Google News for thepennyhoarder.com
--   Today I Found Out  HTTP 404 (its permalinks include index.php)  → /index.php/feed/
-- Errors, cache headers and the backfill flag are reset so each is fetched and backfilled fresh.

update public.feeds
   set url = v.url, last_error = null, last_status = null, etag = null, last_modified = null, backfilled_at = null
  from (values
    ('BarBend',           'https://news.google.com/rss/search?q=site:barbend.com+when:7d&hl=en-US&gl=US&ceid=US:en'),
    ('The Penny Hoarder', 'https://news.google.com/rss/search?q=site:thepennyhoarder.com+when:7d&hl=en-US&gl=US&ceid=US:en'),
    ('Today I Found Out', 'https://www.todayifoundout.com/index.php/feed/')
  ) as v(name, url)
 where feeds.name = v.name
   and not exists (select 1 from public.feeds f2 where f2.url = v.url);
