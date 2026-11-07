-- Found on the first Railway run: Freakonomics Radio's feed lists the same episode twice, and
-- ON CONFLICT DO UPDATE cannot touch one row twice in a statement. De-duplicate each batch first.

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
    -- A feed can list the same link twice (reposts, tracking variants). Keep one per normalised URL,
    -- otherwise ON CONFLICT DO UPDATE would touch the same row twice and fail.
    select distinct on (public.normalize_url(x.url)) x.*
    from jsonb_to_recordset(coalesce(report -> 'entries', '[]'::jsonb)) as x(
      title text, url text, guid text, published_at timestamptz, preview text, media_type text, media_url text,
      thumbnail_url text, duration_seconds integer, views bigint, transcript_url text)
    where nullif(btrim(x.title), '') is not null and x.url ~* '^https?://\S+$' and x.url !~* 'youtube\.com/shorts/'
    order by public.normalize_url(x.url), x.published_at desc nulls last
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
