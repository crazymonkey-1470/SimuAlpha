-- Speed: the Railway worker's saves were hitting the 3-second limit on its connection ("canceling statement
-- due to statement timeout") on 16 of 56 sources. Measured on live: ~40 ms per headline, almost all of it
-- in matching a headline to stories from the last ±3 days (it scored every one, ~1,400 of them), and it
-- ran for every headline in every batch, including the ~95% already stored.
--
-- 1. A GiST trigram index lets the match look at the nearest headlines first (same results on 300 live
--    samples, ~4x faster).
-- 2. worker_report inserts only headlines not already stored; for the rest it just refreshes view counts,
--    so the insert trigger runs for new headlines only.

create index if not exists feed_entries_title_gist on public.feed_entries using gist (title_key extensions.gist_trgm_ops);

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
  if length(key) > 12 then
    select c.story_id into match
    from (
      select e.story_id, e.feed_id, e.title_key, coalesce(e.published_at, e.created_at) as seen_at
      from public.feed_entries e
      order by e.title_key operator(extensions.<->) key
      limit 60
    ) c
    where c.seen_at between ts - interval '3 days' and ts + interval '3 days'
      and (c.feed_id <> new.feed_id or c.title_key = key)
      and extensions.similarity(c.title_key, key) >= 0.42
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

create or replace function public.worker_report(token text, feed_id uuid, report jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  f     public.feeds;
  added integer := 0;
  st    integer := nullif(report ->> 'status', '')::integer;
  more  boolean := coalesce((report ->> 'append')::boolean, false);   -- a later chunk of the same run
begin
  if not public.ingest_token_ok(worker_report.token) then
    raise exception 'Invalid or revoked ingest token' using errcode = '28000';
  end if;
  select * into f from public.feeds where id = worker_report.feed_id;
  if not found then
    raise exception 'No feed with id %', worker_report.feed_id using errcode = 'no_data_found';
  end if;
  update public.ingest_state
     set worker_last_run_at = now(), worker_version = coalesce(report ->> 'version', worker_version)
   where id;

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
    -- A feed can list the same link twice (reposts, tracking variants). Keep one per normalised URL.
    select distinct on (public.normalize_url(x.url)) x.*, public.normalize_url(x.url) as nkey
    from jsonb_to_recordset(coalesce(report -> 'entries', '[]'::jsonb)) as x(
      title text, url text, guid text, published_at timestamptz, preview text, media_type text, media_url text,
      thumbnail_url text, duration_seconds integer, views bigint, transcript_url text)
    where nullif(btrim(x.title), '') is not null and x.url ~* '^https?://\S+$' and x.url !~* 'youtube\.com/shorts/'
    order by public.normalize_url(x.url), x.published_at desc nulls last
    limit 100
  ), refreshed as (
    -- Headlines already stored: only refresh view counts (no insert, so the insert trigger doesn't run).
    update public.feed_entries e set views = i.views
    from incoming i
    where e.url_key = i.nkey and i.views is not null and e.views is distinct from i.views
    returning 1
  ), ins as (
    insert into public.feed_entries (feed_id, guid, url, title, published_at, preview, topics, story_id,
                                     media_type, media_url, thumbnail_url, duration_seconds, views, transcript_url)
    select f.id, left(i.guid, 500), i.url, left(btrim(i.title), 300), least(i.published_at, now()),
           left(public.html_to_text(i.preview), 400), f.topics, gen_random_uuid(),
           case when i.media_type in ('article', 'video', 'podcast') then i.media_type
                when f.kind = 'youtube' then 'video' when f.kind = 'podcast' then 'podcast' else 'article' end,
           i.media_url, i.thumbnail_url, i.duration_seconds, i.views, i.transcript_url
    from incoming i
    where (i.published_at is null or i.published_at > now() - interval '35 days')
      and not exists (select 1 from public.feed_entries x where x.url_key = i.nkey)
    on conflict on constraint feed_entries_url_unique do nothing
    returning 1
  )
  select count(*) into added from ins;

  update public.feeds
     set last_fetched_at = now(), last_status = st,
         last_error = case when st between 200 and 399 then null
                           else coalesce(nullif(report ->> 'error', ''), 'HTTP ' || coalesce(st::text, '?')) end,
         last_new_count = case when st between 200 and 399 then (case when more then coalesce(last_new_count, 0) else 0 end) + added
                               else last_new_count end,
         etag = coalesce(nullif(report ->> 'etag', ''), etag),
         last_modified = coalesce(nullif(report ->> 'last_modified', ''), last_modified),
         backfilled_at = case when (report ->> 'backfilled')::boolean then now() else backfilled_at end
   where id = f.id;
  return added;
end;
$$;
