-- Railway worker + YouTube / podcast sources.
--   * The Railway worker pulls feeds and writes them through two token-checked functions
--     (worker_sources, worker_report). It never needs Supabase's secret key.
--   * Fallback: while the worker has run in the last 60 minutes, the database's own fetcher
--     (pg_cron + pg_net) stays idle; if the worker stops, the database takes over again.
--   * feeds.kind: rss | youtube | podcast. Entries gain media fields (thumbnail, duration,
--     views, audio/video URL, transcript URL). YouTube Shorts are skipped.

create extension if not exists pgcrypto with schema extensions;

alter table public.feeds
  add column kind          text not null default 'rss' check (kind in ('rss', 'youtube', 'podcast')),
  add column input_url     text,
  add column resolved      boolean not null default true,
  add column etag          text,
  add column last_modified text;
comment on column public.feeds.resolved is
  'false until the worker turns input_url (a YouTube channel link/@handle or a podcast name/Apple link) into a feed URL.';

alter table public.feed_entries
  add column media_type       text not null default 'article' check (media_type in ('article', 'video', 'podcast')),
  add column media_url        text,
  add column thumbnail_url    text,
  add column duration_seconds integer,
  add column views            bigint,
  add column transcript_url   text;

create table public.ingest_state (
  id                 boolean primary key default true check (id),
  worker_last_run_at timestamptz,
  worker_version     text
);
insert into public.ingest_state (id) values (true);

create table public.ingest_tokens (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  label        text not null default 'Railway worker',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index ingest_tokens_created_by_idx on public.ingest_tokens (created_by);

-- "00:51:51" / "51:51" / "3111" → seconds
create function public.parse_duration(t text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  parts text[];
begin
  t := btrim(coalesce(t, ''));
  if t ~ '^\d+(\.\d+)?$' then return round(t::numeric)::integer; end if;
  if t ~ '^\d+(:\d{1,2}){1,2}$' then
    parts := string_to_array(t, ':');
    if array_length(parts, 1) = 3 then
      return parts[1]::integer * 3600 + parts[2]::integer * 60 + parts[3]::integer;
    end if;
    return parts[1]::integer * 60 + parts[2]::integer;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Database fetcher (fallback) now understands YouTube and podcast feeds too
-- ---------------------------------------------------------------------------
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
                     case when btrim(r.guid) ~* '^https?://\S+$' then btrim(r.guid) end);
    continue when link is null or link !~* '^https?://\S+$' or public.html_to_text(r.title) is null;
    continue when link ~* 'youtube\.com/shorts/';
    pub := coalesce(public.safe_timestamptz(r.pub), public.safe_timestamptz(r.upd));
    continue when pub is not null and pub < now() - interval '14 days';
    mtype := case when f.kind = 'youtube' or link ~* 'youtube\.com/watch' then 'video'
                  when f.kind = 'podcast' or coalesce(r.etype, '') ~* '^audio/' then 'podcast'
                  else 'article' end;
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

-- Stays idle while the Railway worker is healthy (ran in the last 60 minutes).
create or replace function public.enqueue_feed_fetches(force boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  f   public.feeds;
  rid bigint;
  n   integer := 0;
begin
  if not force and exists (
    select 1 from public.ingest_state s where s.worker_last_run_at > now() - interval '60 minutes'
  ) then
    return 0;
  end if;
  for f in
    select * from public.feeds fd
    where fd.active and fd.resolved
      and (force or fd.last_fetched_at is null or fd.last_fetched_at < now() - fd.fetch_every)
      and not exists (select 1 from public.feed_fetches x where x.feed_id = fd.id)
  loop
    select net.http_get(
      url := f.url,
      headers := jsonb_build_object(
        'User-Agent', 'TrueAdamPrep/1.0 (+https://simualpha.com) feed reader',
        'Accept', 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5'),
      timeout_milliseconds := 20000) into rid;
    insert into public.feed_fetches (request_id, feed_id) values (rid, f.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Worker tokens + the two functions the worker calls
-- ---------------------------------------------------------------------------
create function public.ingest_token_ok(token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  hit uuid;
begin
  update public.ingest_tokens t set last_used_at = now()
  where t.token_hash = encode(extensions.digest(coalesce(token, ''), 'sha256'), 'hex') and t.revoked_at is null
  returning t.id into hit;
  return hit is not null;
end;
$$;

-- Producer only. Returns the token ONCE; only its hash is stored.
create function public.create_ingest_token(label text default 'Railway worker')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw text := 'ta_ingest_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if auth.uid() is not null and public.my_role() is distinct from 'producer' then
    raise exception 'Only the producer can create worker tokens.' using errcode = '42501';
  end if;
  insert into public.ingest_tokens (token_hash, label, created_by)
  values (encode(extensions.digest(raw, 'sha256'), 'hex'), coalesce(nullif(btrim(label), ''), 'Railway worker'), auth.uid());
  return raw;
end;
$$;

create function public.revoke_ingest_tokens()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if auth.uid() is not null and public.my_role() is distinct from 'producer' then
    raise exception 'Only the producer can revoke worker tokens.' using errcode = '42501';
  end if;
  update public.ingest_tokens set revoked_at = now() where revoked_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- What the worker should fetch.
create function public.worker_sources(token text)
returns table (id uuid, name text, kind text, url text, input_url text, resolved boolean,
               etag text, last_modified text, topics text[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.ingest_token_ok(worker_sources.token) then
    raise exception 'Invalid or revoked ingest token' using errcode = '28000';
  end if;
  update public.ingest_state set worker_last_run_at = now();
  return query
    select f.id, f.name, f.kind, f.url, f.input_url, f.resolved, f.etag, f.last_modified, f.topics
    from public.feeds f where f.active order by f.last_fetched_at nulls first;
end;
$$;

-- What the worker found for one source. report:
--   { status, error?, url? (resolved feed URL), etag?, last_modified?, version?,
--     entries: [{ title, url, guid?, published_at?, preview?, media_type?, media_url?,
--                 thumbnail_url?, duration_seconds?, views?, transcript_url? }] }
create function public.worker_report(token text, feed_id uuid, report jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  f     public.feeds;
  added integer := 0;
  st    integer := nullif(report ->> 'status', '')::integer;
begin
  if not public.ingest_token_ok(worker_report.token) then
    raise exception 'Invalid or revoked ingest token' using errcode = '28000';
  end if;
  select * into f from public.feeds where id = worker_report.feed_id;
  if not found then
    raise exception 'No feed with id %', worker_report.feed_id using errcode = 'no_data_found';
  end if;
  update public.ingest_state
     set worker_last_run_at = now(), worker_version = coalesce(report ->> 'version', worker_version);

  if coalesce(report ->> 'url', '') ~* '^https?://\S+$' and (report ->> 'url') is distinct from f.url then
    begin
      update public.feeds set url = report ->> 'url', resolved = true,
             input_url = coalesce(input_url, f.url) where id = f.id;
    exception when unique_violation then
      update public.feeds set last_error = 'Resolves to a feed that is already a source: ' || (report ->> 'url'),
             last_fetched_at = now(), active = false where id = f.id;
      return 0;
    end;
  end if;

  with incoming as (
    select x.* from jsonb_to_recordset(coalesce(report -> 'entries', '[]'::jsonb)) as x(
      title text, url text, guid text, published_at timestamptz, preview text, media_type text, media_url text,
      thumbnail_url text, duration_seconds integer, views bigint, transcript_url text)
    where nullif(btrim(x.title), '') is not null and x.url ~* '^https?://\S+$' and x.url !~* 'youtube\.com/shorts/'
    limit 100
  ), ins as (
    insert into public.feed_entries (feed_id, guid, url, title, published_at, preview, topics, story_id,
                                     media_type, media_url, thumbnail_url, duration_seconds, views, transcript_url)
    select f.id, left(i.guid, 500), i.url, left(btrim(i.title), 300), least(i.published_at, now()),
           left(public.html_to_text(i.preview), 400), f.topics, gen_random_uuid(),
           case when i.media_type in ('article', 'video', 'podcast') then i.media_type
                when f.kind = 'youtube' then 'video' when f.kind = 'podcast' then 'podcast' else 'article' end,
           i.media_url, i.thumbnail_url, i.duration_seconds, i.views, i.transcript_url
    from incoming i
    where i.published_at is null or i.published_at > now() - interval '14 days'
    on conflict on constraint feed_entries_url_unique do update
      set views = coalesce(excluded.views, public.feed_entries.views)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into added from ins;

  update public.feeds
     set last_fetched_at = now(), last_status = st,
         last_error = case when st between 200 and 399 then null
                           else coalesce(nullif(report ->> 'error', ''), 'HTTP ' || coalesce(st::text, '?')) end,
         last_new_count = case when st between 200 and 399 then added else last_new_count end,
         etag = coalesce(nullif(report ->> 'etag', ''), etag),
         last_modified = coalesce(nullif(report ->> 'last_modified', ''), last_modified)
   where id = f.id;
  return added;
end;
$$;

-- For the Sources page: who is fetching right now.
create function public.ingest_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'worker_last_run_at', s.worker_last_run_at,
    'worker_version', s.worker_version,
    'mode', case when s.worker_last_run_at > now() - interval '60 minutes' then 'worker' else 'database' end,
    'active_tokens', (select count(*) from public.ingest_tokens t where t.revoked_at is null)
  )
  from public.ingest_state s
  where (select public.is_member()) or auth.uid() is null
$$;

-- ---------------------------------------------------------------------------
-- source_inbox / producer_digest carry the media fields (columns appended)
-- ---------------------------------------------------------------------------
create or replace view public.source_inbox
with (security_invoker = true)
as
with entries as (
  select e.*, f.name as source_name
  from public.feed_entries e
  join public.feeds f on f.id = e.feed_id
), lead as (
  select distinct on (story_id) *
  from entries
  order by story_id, published_at asc nulls last, created_at
), agg as (
  select story_id,
         count(*)::integer as outlet_count,
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

-- Digest: each story says if it's a video/podcast, its length in minutes, and its views.
create or replace function public.producer_digest(days integer default 3, per_topic integer default 4, only_topics text[] default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with recent as (
    select s.*,
           coalesce(s.topics[1], 'news') as topic,
           (s.outlet_count - 1) * 2 + s.discuss_count * 3 + s.more_count - s.not_count * 3
             + greatest(0, 2 - extract(epoch from now() - s.latest_at) / 86400.0)
             - case when s.read then 0.5 else 0 end as score
    from public.source_inbox s
    where s.latest_at > now() - make_interval(days => greatest(1, producer_digest.days))
      and not s.in_prep
      and (producer_digest.only_topics is null or s.topics && producer_digest.only_topics)
  ), ranked as (
    select r.*, row_number() over (partition by r.topic order by r.score desc, r.latest_at desc) as rn
    from recent r
  ), sections as (
    select r.topic,
           jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'title', r.title,
             'url', r.url,
             'type', case when r.media_type <> 'article' then r.media_type end,
             'min', case when r.duration_seconds > 0 then round(r.duration_seconds / 60.0) end,
             'views', r.views,
             'src', r.source,
             'date', to_char(coalesce(r.published_at, r.latest_at), 'YYYY-MM-DD'),
             'outlets', nullif(r.outlet_count, 1),
             'preview', left(r.preview, 160),
             'discuss', nullif(r.discuss_count, 0),
             'more', nullif(r.more_count, 0),
             'not', nullif(r.not_count, 0),
             'read', case when r.read then true end))
             order by r.score desc) as items
    from ranked r
    where r.rn <= greatest(1, producer_digest.per_topic)
    group by r.topic
  ), host_signal as (
    select p.id, p.display_name,
           (select coalesce(jsonb_agg(x.topic order by x.w desc), '[]') from (
              select t.topic, sum(t.w) as w from (
                select unnest(i.topics) as topic, 3 as w from public.item_highlights h join public.item_cards i on i.id = h.item_id
                 where h.user_id = p.id and h.created_at > now() - interval '90 days'
                union all
                select unnest(e.topics), 2 from public.source_feedback sf join public.feed_entries e on e.id = sf.entry_id
                 where sf.member_id = p.id and sf.kind in ('discuss', 'more_like_this') and sf.created_at > now() - interval '90 days'
                union all
                select unnest(e.topics), -2 from public.source_feedback sf join public.feed_entries e on e.id = sf.entry_id
                 where sf.member_id = p.id and sf.kind = 'not_interested' and sf.created_at > now() - interval '90 days'
              ) t group by t.topic having sum(t.w) > 0 order by w desc limit 3) x) as likes,
           (select coalesce(jsonb_agg(x.title), '[]') from (
              select e.title from public.source_feedback sf join public.feed_entries e on e.id = sf.entry_id
              where sf.member_id = p.id and sf.kind = 'more_like_this' order by sf.created_at desc limit 4) x) as more_like,
           (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('title', x.title, 'why', x.reason))), '[]') from (
              select e.title, sf.reason from public.source_feedback sf join public.feed_entries e on e.id = sf.entry_id
              where sf.member_id = p.id and sf.kind = 'not_interested' order by sf.created_at desc limit 4) x) as not_interested
    from public.profiles p
  )
  select jsonb_build_object(
    'window_days', greatest(1, producer_digest.days),
    'topics', coalesce((select jsonb_object_agg(s.topic, s.items) from sections s), '{}'),
    'this_week', coalesce((select jsonb_agg(i.title) from public.items i where i.status = 'this_week'), '[]'),
    'covered', coalesce((select jsonb_agg(x.title) from (
        select i.title from public.items i where i.status = 'used' and i.updated_at > now() - interval '45 days'
        order by i.updated_at desc limit 20) x), '[]'),
    'episodes', coalesce((select jsonb_agg(jsonb_build_object('title', e.title, 'date', e.recording_date, 'status', e.status)
        order by e.recording_date desc nulls last)
        from (select * from public.episodes order by recording_date desc nulls last limit 4) e), '[]'),
    'hosts', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'name', h.display_name,
        'likes', nullif(h.likes, '[]'::jsonb),
        'more_like', nullif(h.more_like, '[]'::jsonb),
        'not_interested', nullif(h.not_interested, '[]'::jsonb)))) from host_signal h), '[]'),
    'open_research', (select count(*) from public.research_requests r where r.status in ('open', 'in_progress'))
  )
$$;

-- ---------------------------------------------------------------------------
-- Starter YouTube channels and podcasts (feed URLs resolved and checked on 2026-11-07)
-- ---------------------------------------------------------------------------
insert into public.feeds (name, kind, url, input_url, topics) values
  ('BibleProject (YouTube)',        'youtube', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCVfwlh9XpX2Y_tQfjeln9QA', 'https://www.youtube.com/@bibleproject',       '{religion}'),
  ('Jeff Nippard (YouTube)',        'youtube', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC68TLK0mAEzUyHx5x5k-S1Q', 'https://www.youtube.com/@JeffNippard',        '{working-out}'),
  ('Kurzgesagt (YouTube)',          'youtube', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCsXVk37bltHxD1rDPwtNM8Q', 'https://www.youtube.com/@kurzgesagt',         '{science}'),
  ('History Matters (YouTube)',     'youtube', 'https://www.youtube.com/feeds/videos.xml?channel_id=UC22BdTgxefuvUivrjesETjg', 'https://www.youtube.com/@HistoryMatters',     '{history}'),
  ('Economics Explained (YouTube)', 'youtube', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCZ4AMrDcNrfy3X6nsU8-rPg', 'https://www.youtube.com/@EconomicsExplained', '{economics}'),
  ('The Art of Manliness (podcast)', 'podcast', 'https://rss.art19.com/the-art-of-manliness',          'The Art of Manliness', '{dating-culture}'),
  ('Ask Pastor John (podcast)',      'podcast', 'https://feed.desiringgod.org/ask-pastor-john.rss',    'Ask Pastor John',      '{religion}'),
  ('The Rest Is History (podcast)',  'podcast', 'https://feeds.megaphone.fm/GLT4787413333',            'The Rest Is History',  '{history}'),
  ('Freakonomics Radio (podcast)',   'podcast', 'https://feeds.simplecast.com/Y8lFbOT4',               'Freakonomics Radio',   '{economics}'),
  ('Huberman Lab (podcast)',         'podcast', 'https://feeds.megaphone.fm/hubermanlab',              'Huberman Lab',         '{science}')
on conflict (url) do nothing;

-- ---------------------------------------------------------------------------
-- Privileges. The worker uses the publishable key (anon role) + its ingest token.
-- ---------------------------------------------------------------------------
alter table public.ingest_state  enable row level security;
alter table public.ingest_tokens enable row level security;
revoke all on public.ingest_state, public.ingest_tokens from anon, authenticated;
grant update (kind, input_url, resolved) on public.feeds to authenticated;

revoke execute on function public.ingest_token_ok(text) from public, anon, authenticated;
revoke execute on function public.worker_sources(text), public.worker_report(text, uuid, jsonb) from public;
grant execute on function public.worker_sources(text), public.worker_report(text, uuid, jsonb) to anon, authenticated;
revoke execute on function public.create_ingest_token(text), public.revoke_ingest_tokens(), public.ingest_status() from public, anon;
grant execute on function public.create_ingest_token(text), public.revoke_ingest_tokens(), public.ingest_status() to authenticated;
