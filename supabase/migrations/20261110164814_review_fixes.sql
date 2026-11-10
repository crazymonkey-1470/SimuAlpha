-- Code review fixes (2026-11-10).
-- 1. The database's backup fetcher (ingest_feed_xml) skips headlines already stored, like worker_report,
--    instead of re-running the insert trigger for every item of every feed each cycle.
-- 2. "Outlets" counts newsrooms: feeds.outlet groups several feeds of one outlet (BBC, NPR, Fox, CNBC,
--    Smithsonian, Art of Manliness), so one newsroom's sections don't look like independent confirmation.
-- 3. Story matching applies the ±3-day window before taking the nearest candidates, so a long archive of
--    look-alike headlines (daily columns) can't crowd out the real match.

alter table public.feeds add column if not exists outlet text;
grant update (outlet) on public.feeds to authenticated;
update public.feeds set outlet = case
    when name like 'BBC %' then 'BBC'
    when name like 'NPR %' then 'NPR'
    when name like 'Fox News%' then 'Fox News'
    when name like 'CNBC %' then 'CNBC'
    when name like 'Smithsonian %' then 'Smithsonian'
    when name like 'The Art of Manliness%' then 'The Art of Manliness'
  end
 where outlet is null
   and (name like 'BBC %' or name like 'NPR %' or name like 'Fox News%' or name like 'CNBC %'
        or name like 'Smithsonian %' or name like 'The Art of Manliness%');

create or replace function public.ingest_feed_xml(feed uuid, body text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  f      public.feeds;
  doc    xml;
  r      record;
  link   text;
  pub    timestamptz;
  mtype  text;
  added  integer := 0;
  inserted boolean;
begin
  select * into f from public.feeds where id = feed;
  if not found then return 0; end if;

  body := regexp_replace(coalesce(body, ''), '^[^<]*', '');
  body := regexp_replace(body, '^\s*<\?xml[^>]*\?>', '');
  body := replace(replace(replace(replace(replace(replace(body,
            '&nbsp;', '&#160;'), '&rsquo;', '&#8217;'), '&lsquo;', '&#8216;'), '&ldquo;', '&#8220;'), '&rdquo;', '&#8221;'), '&hellip;', '&#8230;');
  body := replace(replace(body, '&mdash;', '&#8212;'), '&ndash;', '&#8211;');
  begin
    doc := xmlparse(document body);
  exception when others then
    update public.feeds set last_fetched_at = now(), last_status = 200,
           last_error = 'Not valid RSS/Atom: ' || left(sqlerrm, 150) where id = feed;
    return 0;
  end;

  for r in
    select * from xmltable('//*[local-name()="item" or local-name()="entry"]' passing doc
      columns title      text path 'string(*[local-name()="title"])',
              href       text path 'string(*[local-name()="link"][@rel="alternate" or not(@rel)][1]/@href)',
              lnk        text path 'string(*[local-name()="link"][1])',
              guid       text path 'string(*[local-name()="guid" or local-name()="id"][1])',
              pub        text path 'string(*[local-name()="pubDate" or local-name()="published" or local-name()="date" or local-name()="issued"][1])',
              upd        text path 'string(*[local-name()="updated"][1])',
              descr      text path 'string(*[local-name()="description" or local-name()="summary"][1])',
              content    text path 'string(*[local-name()="encoded" or local-name()="content"][1])',
              mdesc      text path 'string(*[local-name()="group"]/*[local-name()="description"][1])',
              thumb      text path 'string(*[local-name()="group"]/*[local-name()="thumbnail"][1]/@url | *[local-name()="image"][1]/@href)',
              views      text path 'string(*[local-name()="group"]/*[local-name()="community"]/*[local-name()="statistics"]/@views)',
              enclosure  text path 'string(*[local-name()="enclosure"][1]/@url)',
              etype      text path 'string(*[local-name()="enclosure"][1]/@type)',
              dur        text path 'string(*[local-name()="duration"][1])',
              transcript text path 'string(*[local-name()="transcript"][1]/@url)')
    limit 80
  loop
    link := coalesce(nullif(btrim(r.href), ''), nullif(btrim(r.lnk), ''),
                     case when btrim(r.guid) ~* '^https?://\S+$' then btrim(r.guid) end,
                     nullif(btrim(r.enclosure), ''));   -- podcasts without <link>: the audio file
    continue when link is null or link !~* '^https?://\S+$' or public.html_to_text(r.title) is null;
    continue when link ~* 'youtube\.com/shorts/';
    pub := coalesce(public.safe_timestamptz(r.pub), public.safe_timestamptz(r.upd));
    continue when pub is not null and pub < now() - interval '14 days';
    mtype := case when f.kind = 'youtube' or link ~* 'youtube\.com/watch' then 'video'
                  when f.kind = 'podcast' or coalesce(r.etype, '') ~* '^audio/' then 'podcast'
                  else 'article' end;
    -- Already stored: only refresh views; don't run the (expensive) insert trigger again.
    if exists (select 1 from public.feed_entries x where x.url_key = public.normalize_url(link)) then
      if coalesce(btrim(r.views), '') ~ '^\d+$' then
        update public.feed_entries x set views = btrim(r.views)::bigint
         where x.url_key = public.normalize_url(link) and x.views is distinct from btrim(r.views)::bigint;
      end if;
      continue;
    end if;
    insert into public.feed_entries (feed_id, guid, url, title, published_at, preview, topics, story_id,
                                     media_type, media_url, thumbnail_url, duration_seconds, views, transcript_url)
    values (feed, nullif(left(btrim(r.guid), 500), ''), link, left(public.html_to_text(r.title), 300),
            least(pub, now()),
            left(public.html_to_text(coalesce(nullif(r.descr, ''), nullif(r.mdesc, ''), r.content)), 400), f.topics,
            gen_random_uuid(), mtype,
            case when mtype = 'podcast' then nullif(btrim(r.enclosure), '') when mtype = 'video' then link end,
            nullif(btrim(r.thumb), ''), public.parse_duration(r.dur),
            case when btrim(r.views) ~ '^\d+$' then btrim(r.views)::bigint end,
            nullif(btrim(r.transcript), ''))
    on conflict on constraint feed_entries_url_unique do update
      set views = coalesce(excluded.views, public.feed_entries.views)
    returning (xmax = 0) into inserted;          -- true only for brand-new rows
    added := added + case when inserted then 1 else 0 end;
  end loop;

  update public.feeds set last_fetched_at = now(), last_status = 200, last_error = null, last_new_count = added
  where id = feed;
  return added;
end;
$$;

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
  if exists (select 1 from public.entry_filters x where new.title ~* x.pattern) then
    return null;   -- shopping / quote pages: don't store
  end if;
  new.topics := public.entry_topics(new.topics, new.title, new.preview);
  key := public.story_key(new.title);   -- generated columns aren't filled in yet in BEFORE triggers

  -- Same story: another outlet with a similar headline, or this same source repeating the exact
  -- headline (Google News giving one article two links, a site re-posting under a new address).
  -- Nearest headlines first (GiST trigram index), then the date window and threshold: ~4x faster than
  -- scoring every headline in the window, same matches.
  -- Candidates: similar headlines (trigram %, similarity >= 0.42) inside the ±3-day window, nearest first.
  -- Filtering by window before the limit means a long archive of look-alike headlines can't crowd out
  -- the real match.
  if length(key) > 12 then
    perform set_config('pg_trgm.similarity_threshold', '0.42', true);
    select c.story_id into match
    from (
      select e.story_id, e.feed_id, e.title_key
      from public.feed_entries e
      where e.title_key operator(extensions.%) key
        and coalesce(e.published_at, e.created_at) between ts - interval '3 days' and ts + interval '3 days'
      order by e.title_key operator(extensions.<->) key
      limit 20
    ) c
    where c.feed_id <> new.feed_id or c.title_key = key
    order by extensions.similarity(c.title_key, key) desc
    limit 1;
  end if;
  new.story_id := coalesce(match, new.id);
  if new.item_id is null then
    select i.id into new.item_id from public.items i where i.url_key = public.normalize_url(new.url);
  end if;
  return new;
end;
$$;

create or replace view public.source_inbox
with (security_invoker = true)
as
with entries as (
  select e.*, f.name as source_name, coalesce(f.outlet, f.name) as outlet_key
  from public.feed_entries e
  join public.feeds f on f.id = e.feed_id
  -- The inbox is for fresh stories; older headlines are in search_headlines(). Keeps it fast as the archive grows.
  where coalesce(e.published_at, e.created_at) > now() - interval '62 days'
), lead as (
  select distinct on (story_id) *
  from entries
  order by story_id, published_at asc nulls last, created_at
), agg as (
  select story_id,
         count(distinct outlet_key)::integer as outlet_count,   -- newsrooms, not feeds or copies
         array_agg(distinct source_name) as outlets,
         max(coalesce(published_at, created_at)) as latest_at,
         array_agg(url_key) as url_keys,
         (array_agg(item_id) filter (where item_id is not null))[1] as entry_item_id
  from entries
  group by story_id
), fb as (
  select e.story_id,
         count(*) filter (where sf.kind = 'discuss')::integer        as discuss_count,
         count(*) filter (where sf.kind = 'more_like_this')::integer as more_count,
         count(*) filter (where sf.kind = 'not_interested')::integer as not_count,
         coalesce(array_agg(sf.kind::text) filter (where sf.member_id = auth.uid()), '{}') as my_feedback
  from public.source_feedback sf
  join public.feed_entries e on e.id = sf.entry_id
  group by e.story_id
)
select
  l.story_id,
  l.id as entry_id,
  l.title,
  l.url,
  l.source_name as source,
  l.published_at,
  l.preview,
  l.topics,
  a.outlet_count,
  a.outlets,
  a.latest_at,
  coalesce(a.entry_item_id, (select i.id from public.items i where i.url_key = any(a.url_keys) limit 1)) as item_id,
  coalesce(a.entry_item_id, (select i.id from public.items i where i.url_key = any(a.url_keys) limit 1)) is not null as in_prep,
  coalesce(fb.discuss_count, 0) as discuss_count,
  coalesce(fb.more_count, 0)    as more_count,
  coalesce(fb.not_count, 0)     as not_count,
  coalesce(fb.my_feedback, '{}') as my_feedback,
  rd.summary as read_summary,
  rd.checked_at as read_checked_at,
  rd.url_key is not null as read,
  l.media_type,
  l.media_url,
  l.thumbnail_url,
  l.duration_seconds,
  l.views,
  l.transcript_url
from lead l
join agg a using (story_id)
left join fb using (story_id)
left join lateral (
  select r.url_key, r.summary, r.checked_at from public.article_reads r
  where r.url_key = any(a.url_keys) order by r.checked_at desc limit 1
) rd on true;
