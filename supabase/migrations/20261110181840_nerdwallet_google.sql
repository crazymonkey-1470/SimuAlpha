-- NerdWallet answers the Railway worker with HTTP 403. Read it through Google News instead (as with
-- CNN, AP, Reuters, WSJ, BarBend and The Penny Hoarder).
update public.feeds
   set url = 'https://news.google.com/rss/search?q=site:nerdwallet.com+when:7d&hl=en-US&gl=US&ceid=US:en',
       last_error = null, last_status = null, etag = null, last_modified = null, backfilled_at = null
 where name = 'NerdWallet'
   and not exists (select 1 from public.feeds f2 where f2.url = 'https://news.google.com/rss/search?q=site:nerdwallet.com+when:7d&hl=en-US&gl=US&ceid=US:en');
