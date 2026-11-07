-- Source inbox: filter before reading.
--   feeds / feed_entries   RSS + Atom feeds fetched inside Postgres (pg_cron + pg_net; no extra server)
--   duplicate detection    same link (normalised URL) and same story across outlets (title similarity)
--   source_feedback        "Discuss this", "More like this", "Not interested" (+ reason)
--   article_reads          read-once store: Grok's verified summary + sources + last-checked date
--   producer_digest()      one compact call: thin topic sections, coverage, each host's interests

-- ---------------------------------------------------------------------------
-- Text helpers
-- ---------------------------------------------------------------------------
create function public.html_to_text(t text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  r text := t;
  m text[];
begin
  if r is null then return null; end if;
  r := regexp_replace(r, '<!\[CDATA\[|\]\]>', '', 'g');
  r := regexp_replace(r, '<(script|style)[^>]*>.*?</(script|style)>', ' ', 'gi');
  r := regexp_replace(r, '<[^>]+>', ' ', 'g');
  r := replace(replace(replace(replace(replace(replace(r, '&nbsp;', ' '), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&apos;', '''');
  r := replace(replace(replace(replace(replace(r, '&rsquo;', '’'), '&lsquo;', '‘'), '&ldquo;', '“'), '&rdquo;', '”'), '&hellip;', '…');
  r := replace(replace(r, '&mdash;', '—'), '&ndash;', '–');
  for m in select regexp_matches(r, '&#([xX]?[0-9a-fA-F]+);', 'g') loop
    begin
      r := replace(r, '&#' || m[1] || ';',
                   chr(case when m[1] ~* '^x' then ('x' || lpad(substr(m[1], 2), 8, '0'))::bit(32)::int else m[1]::int end));
    exception when others then null;
    end;
  end loop;
  r := replace(r, '&amp;', '&');
  r := replace(replace(replace(r, chr(160), ' '), chr(8203), ''), chr(65279), '');   -- nbsp, zero-width, BOM
  return nullif(btrim(regexp_replace(r, '\s+', ' ', 'g')), '');
end;
$$;

-- Headline → comparison key: lower-case, no " - Outlet" suffix, no punctuation.
create function public.story_key(title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
           regexp_replace(lower(regexp_replace(coalesce(title, ''), '\s+[-|–—]\s+[^-|–—]{2,40}$', '')), '[^a-z0-9 ]+', ' ', 'g'),
         '\s+', ' ', 'g'))
$$;

create function public.safe_timestamptz(t text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(btrim(t), '')::timestamptz;
exception when others then
  begin
    return regexp_replace(btrim(t), '^[A-Za-z]{3,9},?\s*', '')::timestamptz;
  exception when others then
    return null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.feeds (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (btrim(name) <> ''),
  url             text not null unique check (url ~* '^https?://\S+$'),
  site_url        text,
  topics          text[] not null default '{}',
  active          boolean not null default true,
  fetch_every     interval not null default interval '2 hours',
  last_fetched_at timestamptz,
  last_status     integer,
  last_error      text,
  last_new_count  integer,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
comment on table public.feeds is 'Trusted RSS/Atom sources. Fetched by pg_cron + pg_net every fetch_every.';
create index feeds_created_by_idx on public.feeds (created_by);

create table public.feed_entries (
  id           uuid primary key default gen_random_uuid(),
  feed_id      uuid not null references public.feeds (id) on delete cascade,
  guid         text,
  url          text not null check (url ~* '^https?://\S+$'),
  url_key      text generated always as (public.normalize_url(url)) stored,
  title        text not null,
  title_key    text generated always as (public.story_key(title)) stored,
  published_at timestamptz,
  preview      text,
  topics       text[] not null default '{}',
  story_id     uuid not null,
  item_id      uuid references public.items (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint feed_entries_url_unique unique (url_key)
);
comment on column public.feed_entries.story_id is 'Entries from different outlets about the same story share a story_id (first entry''s id).';
create index feed_entries_story_idx     on public.feed_entries (story_id);
create index feed_entries_published_idx on public.feed_entries (coalesce(published_at, created_at) desc);
create index feed_entries_feed_idx      on public.feed_entries (feed_id, created_at desc);
create index feed_entries_item_idx      on public.feed_entries (item_id);
create index feed_entries_title_trgm    on public.feed_entries using gin (title_key extensions.gin_trgm_ops);

-- Same story from another outlet within ±3 days → join its story.
create function public.feed_entries_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ts  timestamptz := coalesce(new.published_at, new.created_at, now());
  key text := public.story_key(new.title);   -- generated columns aren't filled in yet in BEFORE triggers
  match uuid;
begin
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
create trigger feed_entries_before_insert before insert on public.feed_entries
  for each row execute function public.feed_entries_before_insert();

create table public.feed_fetches (
  request_id   bigint primary key,
  feed_id      uuid not null references public.feeds (id) on delete cascade,
  requested_at timestamptz not null default now()
);
create index feed_fetches_feed_idx on public.feed_fetches (feed_id);

create type public.feedback_kind as enum ('discuss', 'more_like_this', 'not_interested');

create table public.source_feedback (
  member_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  entry_id   uuid not null references public.feed_entries (id) on delete cascade,
  kind       public.feedback_kind not null,
  reason     text,
  created_at timestamptz not null default now(),
  primary key (member_id, entry_id, kind)
);
create index source_feedback_entry_idx on public.source_feedback (entry_id);

create table public.article_reads (
  url_key     text primary key,
  url         text not null,
  title       text,
  summary     text not null check (btrim(summary) <> ''),
  key_points  text[] not null default '{}',
  sources     text[] not null default '{}',
  verdict     text,
  fingerprint text,
  read_by     text not null default 'Grok',
  checked_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
comment on table public.article_reads is
  'Read-once store. Check get_read(url) before researching an article; save_read() after.';

-- ---------------------------------------------------------------------------
-- Ingestion (RSS 2.0, RSS 1.0/RDF and Atom)
-- ---------------------------------------------------------------------------
create function public.ingest_feed_xml(feed uuid, body text)
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
  added  integer := 0;
  rc     integer;
begin
  select * into f from public.feeds where id = feed;
  if not found then return 0; end if;

  body := regexp_replace(coalesce(body, ''), '^[^<]*', '');                 -- BOM / junk before the first tag
  body := regexp_replace(body, '^\s*<\?xml[^>]*\?>', '');                    -- encoding declaration (text is already UTF-8)
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
      columns title   text path 'string(*[local-name()="title"])',
              href    text path 'string(*[local-name()="link"][@rel="alternate" or not(@rel)][1]/@href)',
              lnk     text path 'string(*[local-name()="link"][1])',
              guid    text path 'string(*[local-name()="guid" or local-name()="id"][1])',
              pub     text path 'string(*[local-name()="pubDate" or local-name()="published" or local-name()="date" or local-name()="issued"][1])',
              upd     text path 'string(*[local-name()="updated"][1])',
              descr   text path 'string(*[local-name()="description" or local-name()="summary"][1])',
              content text path 'string(*[local-name()="encoded" or local-name()="content"][1])')
    limit 80
  loop
    link := coalesce(nullif(btrim(r.href), ''), nullif(btrim(r.lnk), ''),
                     case when btrim(r.guid) ~* '^https?://\S+$' then btrim(r.guid) end);
    continue when link is null or link !~* '^https?://\S+$' or public.html_to_text(r.title) is null;
    pub := coalesce(public.safe_timestamptz(r.pub), public.safe_timestamptz(r.upd));
    continue when pub is not null and pub < now() - interval '14 days';
    insert into public.feed_entries (feed_id, guid, url, title, published_at, preview, topics, story_id)
    values (feed, nullif(left(btrim(r.guid), 500), ''), link, left(public.html_to_text(r.title), 300),
            least(pub, now()), left(public.html_to_text(coalesce(nullif(r.descr, ''), r.content)), 400), f.topics,
            gen_random_uuid())
    on conflict (url_key) do nothing;
    get diagnostics rc = row_count;
    added := added + rc;
  end loop;

  update public.feeds set last_fetched_at = now(), last_status = 200, last_error = null, last_new_count = added
  where id = feed;
  return added;
end;
$$;

-- Ask pg_net to fetch every feed that is due (runs from pg_cron).
create function public.enqueue_feed_fetches(force boolean default false)
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
  for f in
    select * from public.feeds fd
    where fd.active
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

-- Parse whatever pg_net has fetched (runs every minute from pg_cron).
create function public.process_feed_responses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select ff.request_id, ff.feed_id, resp.status_code, resp.content, resp.error_msg, resp.timed_out
    from public.feed_fetches ff
    join net._http_response resp on resp.id = ff.request_id
  loop
    if r.status_code between 200 and 299 then
      perform public.ingest_feed_xml(r.feed_id, r.content);
    else
      update public.feeds
         set last_fetched_at = now(), last_status = r.status_code,
             last_error = coalesce(nullif(r.error_msg, ''), case when r.timed_out then 'timed out' end,
                                   'HTTP ' || coalesce(r.status_code::text, '?'))
       where id = r.feed_id;
    end if;
    delete from public.feed_fetches where request_id = r.request_id;
    n := n + 1;
  end loop;

  update public.feeds fd set last_fetched_at = now(), last_error = 'no response (timed out)'
  where fd.id in (select feed_id from public.feed_fetches where requested_at < now() - interval '10 minutes');
  delete from public.feed_fetches where requested_at < now() - interval '10 minutes';
  return n;
end;
$$;

-- Keep the inbox small: drop old entries nobody acted on.
create function public.prune_feed_entries()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.feed_entries e
    where coalesce(e.published_at, e.created_at) < now() - interval '30 days'
      and e.item_id is null
      and not exists (select 1 from public.source_feedback sf where sf.entry_id = e.id)
    returning 1
  )
  select count(*)::integer from gone
$$;

-- "Fetch now" from the site (producer only).
create function public.refresh_feeds()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.my_role() is distinct from 'producer' and auth.uid() is not null then
    raise exception 'Only the producer can refresh sources.' using errcode = '42501';
  end if;
  return public.enqueue_feed_fetches(true);
end;
$$;

-- ---------------------------------------------------------------------------
-- The inbox: one row per story (lead entry + every outlet that covered it)
-- ---------------------------------------------------------------------------
create view public.source_inbox
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
  rd.url_key is not null as read
from lead l
join agg a using (story_id)
left join fb using (story_id)
left join lateral (
  select r.url_key, r.summary, r.checked_at from public.article_reads r
  where r.url_key = any(a.url_keys) order by r.checked_at desc limit 1
) rd on true;

-- ---------------------------------------------------------------------------
-- Feedback + promotion
-- ---------------------------------------------------------------------------
create function public.set_feedback(entry_id uuid, kind public.feedback_kind, turn_on boolean default true, reason text default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  story uuid;
begin
  if auth.uid() is null then
    raise exception 'set_feedback is for signed-in crew members' using errcode = '42501';
  end if;
  select e.story_id into story from public.feed_entries e where e.id = set_feedback.entry_id;
  if story is null then
    raise exception 'No feed entry with id %', set_feedback.entry_id using errcode = 'no_data_found';
  end if;
  if not set_feedback.turn_on then
    delete from public.source_feedback sf
    where sf.member_id = auth.uid() and sf.kind = set_feedback.kind
      and sf.entry_id in (select e.id from public.feed_entries e where e.story_id = story);
    return;
  end if;
  -- "Not interested" and the positive buttons cancel each other out.
  delete from public.source_feedback sf
  where sf.member_id = auth.uid()
    and sf.entry_id in (select e.id from public.feed_entries e where e.story_id = story)
    and (case when set_feedback.kind = 'not_interested' then sf.kind <> 'not_interested'
              else sf.kind = 'not_interested' end);
  insert into public.source_feedback (member_id, entry_id, kind, reason)
  values (auth.uid(), set_feedback.entry_id, set_feedback.kind, nullif(btrim(set_feedback.reason), ''))
  on conflict on constraint source_feedback_pkey do update set reason = excluded.reason, created_at = now();
end;
$$;

-- "Discuss this": records the vote and puts the story in the prep-room inbox (once).
create function public.discuss_entry(entry_id uuid, reason text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e       record;
  item    uuid;
begin
  select fe.*, f.name as source_name into e
  from public.feed_entries fe join public.feeds f on f.id = fe.feed_id
  where fe.id = discuss_entry.entry_id;
  if not found then
    raise exception 'No feed entry with id %', discuss_entry.entry_id using errcode = 'no_data_found';
  end if;
  perform public.set_feedback(discuss_entry.entry_id, 'discuss', true, discuss_entry.reason);

  select coalesce(
           (select x.item_id from public.feed_entries x where x.story_id = e.story_id and x.item_id is not null limit 1),
           (select i.id from public.items i where i.url_key = e.url_key))
    into item;
  if item is null then
    item := public.add_item(title => e.title, url => e.url, source => e.source_name,
                            published_at => e.published_at::date, topics => e.topics);
  end if;
  update public.feed_entries fe set item_id = item where fe.story_id = e.story_id and fe.item_id is null;
  return item;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read-once store
-- ---------------------------------------------------------------------------
create function public.get_read(url text, max_age interval default interval '30 days')
returns setof public.article_reads
language sql
stable
security invoker
set search_path = ''
as $$
  select * from public.article_reads r
  where r.url_key = public.normalize_url(get_read.url)
    and r.checked_at > now() - get_read.max_age
$$;

create function public.save_read(
  url         text,
  summary     text,
  key_points  text[] default '{}',
  sources     text[] default '{}',
  verdict     text default null,
  title       text default null,
  fingerprint text default null,
  read_by     text default 'Grok'
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  k text := public.normalize_url(save_read.url);
begin
  if k is null then
    raise exception 'save_read needs a URL' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.article_reads as a (url_key, url, title, summary, key_points, sources, verdict, fingerprint, read_by, checked_at)
  values (k, save_read.url, save_read.title, save_read.summary, coalesce(save_read.key_points, '{}'),
          coalesce(save_read.sources, '{}'), save_read.verdict, save_read.fingerprint, coalesce(save_read.read_by, 'Grok'), now())
  on conflict (url_key) do update
    set summary = excluded.summary, key_points = excluded.key_points, sources = excluded.sources,
        verdict = excluded.verdict, fingerprint = coalesce(excluded.fingerprint, a.fingerprint),
        title = coalesce(excluded.title, a.title), read_by = excluded.read_by, checked_at = now();
  return k;
end;
$$;

-- ---------------------------------------------------------------------------
-- One compact call for Grok / the producer
-- ---------------------------------------------------------------------------
create function public.producer_digest(days integer default 3, per_topic integer default 4)
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
  ), ranked as (
    select r.*, row_number() over (partition by r.topic order by r.score desc, r.latest_at desc) as rn
    from recent r
  ), sections as (
    select r.topic,
           jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'id', r.entry_id,
             'title', r.title,
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
-- Starter sources (editable on the site's Sources page)
-- ---------------------------------------------------------------------------
insert into public.feeds (name, url, site_url, topics) values
  ('BBC News',              'https://feeds.bbci.co.uk/news/world/rss.xml',              'https://www.bbc.com/news',         '{news}'),
  ('NPR News',              'https://feeds.npr.org/1001/rss.xml',                       'https://www.npr.org',              '{news}'),
  ('NPR Politics',          'https://feeds.npr.org/1014/rss.xml',                       'https://www.npr.org/sections/politics', '{politics}'),
  ('Politico',              'https://rss.politico.com/politics-news.xml',               'https://www.politico.com',         '{politics}'),
  ('CNBC Economy',          'https://www.cnbc.com/id/20910258/device/rss/rss.html',     'https://www.cnbc.com/economy/',    '{economics}'),
  ('Marginal Revolution',   'https://marginalrevolution.com/feed',                      'https://marginalrevolution.com',   '{economics}'),
  ('NPR Your Money',        'https://feeds.npr.org/1018/rss.xml',                       'https://www.npr.org',              '{personal-finance}'),
  ('The Gospel Coalition',  'https://www.thegospelcoalition.org/feed/',                 'https://www.thegospelcoalition.org', '{religion}'),
  ('Christianity Today',    'https://www.christianitytoday.com/feed/',                  'https://www.christianitytoday.com', '{religion}'),
  ('Aeon',                  'https://aeon.co/feed.rss',                                 'https://aeon.co',                  '{philosophy}'),
  ('Smithsonian History',   'https://www.smithsonianmag.com/rss/history/',              'https://www.smithsonianmag.com',   '{history}'),
  ('Stronger by Science',   'https://www.strongerbyscience.com/feed/',                  'https://www.strongerbyscience.com', '{working-out}'),
  ('The Art of Manliness',  'https://www.artofmanliness.com/feed/',                     'https://www.artofmanliness.com',   '{dating-culture}'),
  ('Institute for Family Studies', 'https://ifstudies.org/blog/feed',                  'https://ifstudies.org',            '{dating-culture}'),
  ('ScienceDaily',          'https://www.sciencedaily.com/rss/all.xml',                 'https://www.sciencedaily.com',     '{science}'),
  ('Literary Hub',          'https://lithub.com/feed/',                                 'https://lithub.com',               '{literature}'),
  ('Hyperallergic',         'https://hyperallergic.com/feed/',                          'https://hyperallergic.com',        '{arts}'),
  ('Variety',               'https://variety.com/feed/',                                'https://variety.com',              '{pop-culture}'),
  ('Pitchfork News',        'https://pitchfork.com/rss/news/',                          'https://pitchfork.com',            '{music}'),
  ('Screen Rant',           'https://screenrant.com/feed/',                             'https://screenrant.com',           '{movies}'),
  ('Atlas Obscura',         'https://www.atlasobscura.com/feeds/latest',                'https://www.atlasobscura.com',     '{fun-facts}');

-- ---------------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------------
alter table public.feeds           enable row level security;
alter table public.feed_entries    enable row level security;
alter table public.feed_fetches    enable row level security;
alter table public.source_feedback enable row level security;
alter table public.article_reads   enable row level security;

create policy "members read feeds"      on public.feeds for select to authenticated using ((select public.is_member()));
create policy "producer adds feeds"     on public.feeds for insert to authenticated with check ((select public.my_role()) = 'producer');
create policy "producer edits feeds"    on public.feeds for update to authenticated
  using ((select public.my_role()) = 'producer') with check ((select public.my_role()) = 'producer');
create policy "producer removes feeds"  on public.feeds for delete to authenticated using ((select public.my_role()) = 'producer');

create policy "members read entries"    on public.feed_entries for select to authenticated using ((select public.is_member()));
create policy "members link entries"    on public.feed_entries for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));

create policy "members read feedback"   on public.source_feedback for select to authenticated using ((select public.is_member()));
create policy "give own feedback"       on public.source_feedback for insert to authenticated
  with check ((select public.is_member()) and member_id = (select auth.uid()));
create policy "change own feedback"     on public.source_feedback for update to authenticated
  using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));
create policy "remove own feedback"     on public.source_feedback for delete to authenticated using (member_id = (select auth.uid()));

create policy "members read reads"      on public.article_reads for select to authenticated using ((select public.is_member()));
create policy "members save reads"      on public.article_reads for insert to authenticated with check ((select public.is_member()));
create policy "members update reads"    on public.article_reads for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));

revoke all on public.feeds, public.feed_entries, public.feed_fetches, public.source_feedback,
              public.article_reads, public.source_inbox from anon, authenticated;
grant select, insert, delete on public.feeds to authenticated;
grant update (name, url, site_url, topics, active, fetch_every) on public.feeds to authenticated;
grant select on public.feed_entries to authenticated;
grant update (item_id) on public.feed_entries to authenticated;
grant select, insert, delete on public.source_feedback to authenticated;
grant update (reason, created_at) on public.source_feedback to authenticated;
grant select, insert on public.article_reads to authenticated;
grant update (url, title, summary, key_points, sources, verdict, fingerprint, read_by, checked_at) on public.article_reads to authenticated;
grant select on public.source_inbox to authenticated;

revoke execute on function public.ingest_feed_xml(uuid, text), public.enqueue_feed_fetches(boolean),
                           public.process_feed_responses(), public.prune_feed_entries()
  from public, anon, authenticated;
revoke execute on function public.refresh_feeds(), public.set_feedback(uuid, public.feedback_kind, boolean, text),
                           public.discuss_entry(uuid, text), public.get_read(text, interval),
                           public.save_read(text, text, text[], text[], text, text, text, text),
                           public.producer_digest(integer, integer)
  from public, anon;
grant execute on function public.refresh_feeds(), public.set_feedback(uuid, public.feedback_kind, boolean, text),
                          public.discuss_entry(uuid, text), public.get_read(text, interval),
                          public.save_read(text, text, text[], text[], text, text, text, text),
                          public.producer_digest(integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Schedule (only where pg_cron + pg_net exist, i.e. on Supabase; skipped in local tests)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
    perform cron.schedule('feeds-enqueue',   '*/20 * * * *', 'select public.enqueue_feed_fetches()');
    perform cron.schedule('feeds-process',   '* * * * *',    'select public.process_feed_responses()');
    perform cron.schedule('feeds-retention', '17 4 * * *',   'select public.prune_feed_entries()');
  end if;
end
$$;
