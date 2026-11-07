-- More sources: the major newsrooms (left, centre and right), podcast-notes sites and a new
-- Motivation topic for good-news / comeback stories.
--
-- CNN, AP, Reuters and the WSJ publish no usable RSS any more (CNN's feeds stopped updating in
-- 2023-24; the others block or retired theirs), so they come through Google News filtered to the
-- outlet's site. Google News appends " - Outlet" to every headline and repeats the headline as the
-- description; the trigger below strips both so cards read cleanly. (story_key already ignored the
-- suffix, so cross-outlet grouping worked either way.)

insert into public.topics (slug, name, sort_order, description) values
  ('motivation', 'Motivation', 175, 'Good news, comebacks, faith and grit: stories that lift people up.')
on conflict (slug) do nothing;

create or replace function public.feed_entries_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ts  timestamptz := coalesce(new.published_at, new.created_at, now());
  key text;
  match uuid;
begin
  if new.url ~* '^https://news\.google\.com/' then
    new.title := coalesce(nullif(btrim(regexp_replace(new.title, '\s+[-–—]\s+[^-–—]{1,80}$', '')), ''), new.title);
    if new.preview is not null and lower(new.preview) like lower(new.title) || '%' then
      new.preview := null;
    end if;
  end if;
  key := public.story_key(new.title);   -- generated columns aren't filled in yet in BEFORE triggers

  select e.story_id into match
  from public.feed_entries e
  where e.feed_id <> new.feed_id
    and coalesce(e.published_at, e.created_at) between ts - interval '3 days' and ts + interval '3 days'
    and length(key) > 12
    and extensions.similarity(e.title_key, key) >= 0.42
  order by extensions.similarity(e.title_key, key) desc
  limit 1;
  new.story_id := coalesce(match, new.id);
  if new.item_id is null then
    select i.id into new.item_id from public.items i where i.url_key = public.normalize_url(new.url);
  end if;
  return new;
end;
$$;

insert into public.feeds (name, kind, url, topics) values
  -- Newsrooms
  ('Fox News',                 'rss', 'https://moxie.foxnews.com/google-publisher/latest.xml', '{news}'),
  ('Fox News Politics',        'rss', 'https://moxie.foxnews.com/google-publisher/politics.xml', '{politics}'),
  ('CNN',                      'rss', 'https://news.google.com/rss/search?q=site:cnn.com+when:1d&hl=en-US&gl=US&ceid=US:en', '{news}'),
  ('AP News',                  'rss', 'https://news.google.com/rss/search?q=site:apnews.com+when:1d&hl=en-US&gl=US&ceid=US:en', '{news}'),
  ('Reuters',                  'rss', 'https://news.google.com/rss/search?q=site:reuters.com+when:1d&hl=en-US&gl=US&ceid=US:en', '{news}'),
  ('Wall Street Journal',      'rss', 'https://news.google.com/rss/search?q=site:wsj.com+when:1d&hl=en-US&gl=US&ceid=US:en', '{news,economics}'),
  ('BBC Top Stories',          'rss', 'https://feeds.bbci.co.uk/news/rss.xml', '{news}'),
  ('BBC Science',              'rss', 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', '{science}'),
  ('ABC News',                 'rss', 'https://abcnews.go.com/abcnews/topstories', '{news}'),
  ('CBS News',                 'rss', 'https://www.cbsnews.com/latest/rss/main', '{news}'),
  ('NBC News',                 'rss', 'https://feeds.nbcnews.com/nbcnews/public/news', '{news}'),
  ('PBS NewsHour',             'rss', 'https://www.pbs.org/newshour/feeds/rss/headlines', '{news}'),
  ('Christian Science Monitor','rss', 'https://rss.csmonitor.com/feeds/all', '{news}'),
  ('The Hill',                 'rss', 'https://thehill.com/news/feed/', '{politics}'),
  ('Axios',                    'rss', 'https://api.axios.com/feed/', '{news}'),
  ('NewsNation',               'rss', 'https://www.newsnationnow.com/feed/', '{news}'),
  ('The Free Press',           'rss', 'https://www.thefp.com/feed', '{news}'),
  -- Podcast notes and transcripts
  ('Podcast Notes',            'rss', 'https://podcastnotes.org/feed/', '{guests,motivation}'),
  ('Tim Ferriss (show notes & transcripts)', 'rss', 'https://tim.blog/feed/', '{guests,motivation}'),
  ('Farnam Street',            'rss', 'https://fs.blog/feed/', '{philosophy}'),
  -- Motivation
  ('Good News Network',        'rss', 'https://www.goodnewsnetwork.org/feed/', '{motivation}'),
  ('Positive News',            'rss', 'https://www.positive.news/feed/', '{motivation}'),
  ('Reasons to be Cheerful',   'rss', 'https://reasonstobecheerful.world/feed/', '{motivation}'),
  ('The Optimist Daily',       'rss', 'https://www.optimistdaily.com/feed/', '{motivation}'),
  ('DailyGood',                'rss', 'https://www.dailygood.org/feed/', '{motivation}'),
  ('Sunny Skyz',               'rss', 'https://feeds.feedburner.com/SunnySkyz', '{motivation}')
on conflict (url) do nothing;
