-- Many podcast feeds (e.g. The Art of Manliness, The Rest Is History) give episodes no <link>,
-- only an audio <enclosure>. Use the audio URL as the episode's address so they aren't skipped.

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
