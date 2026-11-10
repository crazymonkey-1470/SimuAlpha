-- Thin topics on 2026-11-08: Working Out 1 story, Personal Finance 13, Fun Facts 19, History 25.
-- Four established sources each. YouTube channels and podcasts are added by handle / show name
-- (resolved = false): the Railway worker finds their feeds on its next run, then backfills a month.
-- Any source that fails shows its error on the Sources page and in feeds.last_error.

insert into public.feeds (name, kind, url, input_url, resolved, topics) values
  -- Working Out
  ('BarBend',                              'rss',     'https://barbend.com/feed/', null, true, '{working-out}'),
  ('Breaking Muscle',                      'rss',     'https://breakingmuscle.com/feed/', null, true, '{working-out}'),
  ('Renaissance Periodization (YouTube)',  'youtube', 'https://www.youtube.com/@RenaissancePeriodization', '@RenaissancePeriodization', false, '{working-out}'),
  ('The Peter Attia Drive (podcast)',      'podcast', 'https://itunes.apple.com/search?media=podcast&entity=podcast&term=The%20Peter%20Attia%20Drive', 'The Peter Attia Drive', false, '{working-out,science}'),
  -- Personal Finance
  ('CNBC Personal Finance',                'rss',     'https://www.cnbc.com/id/21324812/device/rss/rss.html', null, true, '{personal-finance}'),
  ('NerdWallet',                           'rss',     'https://www.nerdwallet.com/blog/feed/', null, true, '{personal-finance}'),
  ('The Penny Hoarder',                    'rss',     'https://www.thepennyhoarder.com/feed/', null, true, '{personal-finance}'),
  ('The Ramsey Show (podcast)',            'podcast', 'https://itunes.apple.com/search?media=podcast&entity=podcast&term=The%20Ramsey%20Show', 'The Ramsey Show', false, '{personal-finance}'),
  -- Fun Facts
  ('Mental Floss',                         'rss',     'https://www.mentalfloss.com/rss.xml', null, true, '{fun-facts}'),
  ('Today I Found Out',                    'rss',     'https://www.todayifoundout.com/feed/', null, true, '{fun-facts}'),
  ('Smithsonian Smart News',               'rss',     'https://www.smithsonianmag.com/rss/smart-news/', null, true, '{fun-facts,science}'),
  ('Stuff You Should Know (podcast)',      'podcast', 'https://itunes.apple.com/search?media=podcast&entity=podcast&term=Stuff%20You%20Should%20Know', 'Stuff You Should Know', false, '{fun-facts}'),
  -- History
  ('HistoryNet',                           'rss',     'https://www.historynet.com/feed/', null, true, '{history}'),
  ('HistoryExtra',                         'rss',     'https://www.historyextra.com/feed/', null, true, '{history}'),
  ('Dan Snow''s History Hit (podcast)',    'podcast', 'https://itunes.apple.com/search?media=podcast&entity=podcast&term=Dan%20Snow%27s%20History%20Hit', 'Dan Snow''s History Hit', false, '{history}'),
  ('Kings and Generals (YouTube)',         'youtube', 'https://www.youtube.com/@KingsandGenerals', '@KingsandGenerals', false, '{history}')
on conflict (url) do nothing;
