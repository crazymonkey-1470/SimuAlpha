-- 1. Month backfill. The Railway worker fills in the last 31 days for every source once, and for each
--    new source automatically. `feeds.backfilled_at` records it; set it back to null to run it again.
-- 2. Categorisation. Every headline gets the topics its words point to (topic_terms), on top of its
--    feed's topics. For general news feeds the detected topic comes first, so the digest and the
--    feed file "Pope Leo urges..." under Religion and "Fed holds rates" under Economics, not just News.
--    Specialised feeds keep their own topic first. The producer (or Grok) tunes the word lists by SQL.
-- 3. Headlines nobody acted on are kept 45 days (was 30), so the backfilled month stays browsable.

alter table public.feeds add column backfilled_at timestamptz;
grant update (backfilled_at) on public.feeds to authenticated;

create table public.topic_terms (
  topic text not null references public.topics (slug) on delete cascade on update cascade,
  term  text not null check (term = lower(term) and length(term) between 2 and 80),
  primary key (topic, term)
);
comment on table public.topic_terms is
  'Words that file a headline under a topic. Each term is a lower-case regular-expression fragment matched '
  'as whole words, case-insensitively (e.g. ''pope'', ''bishops?'', ''interest rates?''). A title hit counts; '
  'a preview needs two hits.';

create function public.topic_terms_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform '' ~* ('\m(?:' || new.term || ')\M');   -- reject terms that are not valid regular expressions
  return new;
end;
$$;
create trigger topic_terms_check before insert or update on public.topic_terms
  for each row execute function public.topic_terms_check();

alter table public.topic_terms enable row level security;
create policy "members read topic terms" on public.topic_terms for select to authenticated using ((select public.is_member()));
create policy "producer edits topic terms" on public.topic_terms for all to authenticated
  using ((select public.my_role()) = 'producer') with check ((select public.my_role()) = 'producer');
revoke all on public.topic_terms from anon, authenticated;
grant select, insert, update, delete on public.topic_terms to authenticated;

insert into public.topic_terms (topic, term)
select x.topic, t.term
from (values
  ('politics', 'senate|senators?|congress|congressional|congressman|congresswoman|house speaker|white house|presidential|president|elections?|electoral|ballots?|voters?|voting|governors?|lawmakers?|legislat(?:ure|ion|ive|ors?)|republicans?|democrats?|gop|supreme court|campaigns?|impeach\w*|trump|biden|vance|filibuster|midterms?|primaries|mayors?|mayoral|shutdown|attorney general|justice department|immigration|deportations?|border patrol|polls?|polling|dnc|rnc|chief of staff|redistricting|gerrymander\w*'),
  ('economics', 'econom(?:y|ic|ics|ist|ists)|inflation|recession|gdp|interest rates?|federal reserve|the fed|fed chair\w*|tariffs?|jobs report|unemployment|jobless|stock market|stocks|wall street|dow jones|nasdaq|s&p 500|treasur(?:y|ies)|deficit|national debt|bond yields?|earnings|layoffs|housing market|consumer prices|trade war|trade deal|oil prices|gas prices|supply chain|stock indexes|stock prices|investors?|sell-off|market rout|bitcoin|crypto(?:currency)?'),
  ('personal-finance', 'personal finance|mortgages?|mortgage rates|retirement|retirees?|401\(k|roth|savings|savers?|credit cards?|credit scores?|social security|student loans?|tax refunds?|paychecks?|household budgets?|cost of living|budgeting|financial advice|net worth|homebuyers?|first-time buyers?|rent|renters|frugal|side hustles?'),
  ('religion', 'church(?:es)?|pope|papal|vatican|bishops?|archbishops?|pastors?|priests?|clergy|christians?|christianity|catholics?|catholicism|evangelicals?|protestants?|bible|biblical|gospel|jesus|christ|god|prayers?|praying|mosques?|muslims?|islam|islamic|jews|jewish|judaism|synagogues?|rabbis?|religion|religions|religious|baptists?|methodists?|lutherans?|anglicans?|theolog\w*|scripture|sermons?|worship|missionar(?:y|ies)|faith leaders|people of faith|atheis\w*|spiritual\w*|easter|hanukkah|ramadan|revival'),
  ('philosophy', 'philosoph\w*|stoic\w*|stoicism|ethics|ethical|morality|moral|meaning of life|socrates|plato|aristotle|nietzsche|kant|existential\w*|virtues?|wisdom|free will|consciousness|marcus aurelius|seneca'),
  ('history', 'history|historians?|historical|ancient|medieval|archaeolog\w*|centuries-old|century-old|world war (?:i|ii|one|two)|wwii|ww2|civil war|revolutionary war|founding fathers|pharaohs?|viking age|roman empire|ottoman|byzantine|middle ages|antiquity|artifacts?|shipwrecks?|ruins|dynasty|cold war'),
  ('working-out', 'workouts?|working out|fitness|strength training|weight ?lifting|weightlifters?|muscles?|muscle mass|gyms?|cardio|bodybuild\w*|hypertrophy|deadlifts?|squats?|bench press|crossfit|marathons?|exercis(?:e|es|ing)|protein|longevity|sedentary|physical activity|vo2 max|testosterone'),
  ('dating-culture', 'dating|marriages?|married|divorc\w*|weddings?|boyfriends?|girlfriends?|romance|romantic|singles|dating apps?|tinder|hinge|bumble|fatherhood|fathers|dads?|motherhood|moms?|parenting|masculinity|manhood|young men|gen z|birth rates?|fertility|loneliness|lonely|marriage rates?|relationship advice|courtship|family formation'),
  ('science', 'science|scientists?|scientific|researchers?|new study|study finds|studies show|nasa|spacex|spacecraft|space station|astronauts?|astronom\w*|telescopes?|galax(?:y|ies)|planets?|asteroids?|comets?|mars|lunar|physics|physicists?|biolog\w*|chemistry|genetic\w*|genes?|dna|climate|fossils?|dinosaurs?|species|evolution\w*|quantum|neuroscien\w*|brain|brains|vaccines?|virus|viruses|cancer|disease|diseases|medical|medicine|clinical trials?|artificial intelligence|ai|robots?|robotics|chatgpt|openai'),
  ('literature', 'novels?|novelists?|authors?|books?|poets?|poetry|poems?|memoirs?|bestsell\w*|literary|literature|fiction|nonfiction|booker prize|pulitzer|publishers?|publishing|bookstores?|libraries|library|essays?|tolkien|c\.s\. lewis|shakespeare'),
  ('arts', 'artists?|artworks?|art world|art fairs?|works of art|street art|fine art|art collectors?|museums?|galler(?:y|ies)|paintings?|painters?|sculptures?|sculptors?|exhibitions?|broadway|opera|ballet|theat(?:er|re)s?|architecture|architects?|photography|photographers?|cathedrals?'),
  ('pop-culture', 'pop culture|celebrit(?:y|ies)|kardashians?|taylor swift|viral|tiktok|influencers?|instagram|youtubers?|netflix|hbo|streaming|tv shows?|reality tv|reality show|sitcoms?|emmys?|golden globes|red carpet|royal family|prince harry|meghan markle|king charles|met gala|halftime show|memes?|fashion|fandom|podcasters?|late-night|snl|saturday night live|joe rogan|mrbeast'),
  ('music', 'music|musical|musicians?|albums?|songs?|singers?|songwriters?|rappers?|hip-hop|concerts?|grammys?|billboard|spotify|country music|guitarists?|drummers?|bands?|world tour|stadium tour|on tour|setlist|lyrics|vinyl|record label|beyonc[eé]|drake|kendrick lamar|festival lineup|coachella|worship music'),
  ('movies', 'movies?|films?|filmmakers?|box office|hollywood|cinema\w*|sequels?|prequels?|remakes?|reboots?|marvel|mcu|dc studios|superman|batman|spider-man|superheroes?|superhero|avengers|star wars|pixar|screenplays?|screenwriters?|oscars?|academy awards?|actress|official trailer|teaser trailer|first trailer|new trailer|blockbusters?|premieres?|a24|lucasfilm|james bond|007|director james gunn'),
  ('fun-facts', 'weird|bizarre|strangest|oddly|unusual|mysterious|record-breaking|world records?|guinness|did you know|fun facts?|trivia|quirky|believe it or not|rarest|octopus|octopuses|optical illusions?'),
  ('motivation', 'inspir(?:e|es|ed|ing|ation|ational)|uplifting|heartwarming|feel-good|good news|heroes|heroic|good samaritans?|lifesaving|overcame|overcoming|beat the odds|against all odds|kindness|kind-hearted|generous|generosity|volunteers?|volunteering|resilien(?:ce|t)|perseveran(?:ce|t)|grit|triumphs?|triumphant|second chance|pay(?:s|ing)? it forward|donat(?:es|ed|ing) (?:his|her|their)|miracle|gratitude|grateful|never gave up|life-changing')
) as x(topic, terms)
cross join lateral regexp_split_to_table(x.terms, '\|(?![^(]*\))') as t(term)
on conflict do nothing;


create function public.entry_filters_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform '' ~* new.pattern;   -- reject invalid regular expressions
  return new;
end;
$$;

-- Shopping pages, stock-quote pages and promos that Google News and some newsrooms mix in. Headlines
-- matching any pattern are not stored. The producer (or Grok) can add patterns.
create table public.entry_filters (
  pattern text primary key check (pattern <> ''),
  note    text
);
alter table public.entry_filters enable row level security;
create policy "members read entry filters" on public.entry_filters for select to authenticated using ((select public.is_member()));
create policy "producer edits entry filters" on public.entry_filters for all to authenticated
  using ((select public.my_role()) = 'producer') with check ((select public.my_role()) = 'producer');
revoke all on public.entry_filters from anon, authenticated;
grant select, insert, update, delete on public.entry_filters to authenticated;
create trigger entry_filters_check before insert or update on public.entry_filters
  for each row execute function public.entry_filters_check();

insert into public.entry_filters (pattern, note) values
  ('stock quote,? price and forecast', 'CNN market-data pages'),
  ('^cnn (stream|underscored)\M', 'CNN app and shopping pages'),
  ('\m(black friday|cyber monday|prime day)\M.*\m(deals?|sales?|discounts?)\M', 'shopping'),
  ('\m(deals?|discounts?|sales?) (on|for)\M.*\m(beds?|mattress\w*|tvs?|laptops?|headphones|gifts?)\M', 'shopping'),
  ('\mgifts? (for|ideas)\M|\mgift guide\M', 'gift guides'),
  ('\m(exclusive|best) (discounts|deals)\M', 'shopping'),
  ('\m(promo|coupon) codes?\M', 'shopping')
on conflict do nothing;

delete from public.feed_entries e
 where e.item_id is null
   and not exists (select 1 from public.source_feedback sf where sf.entry_id = e.id)
   and exists (select 1 from public.entry_filters x where e.title ~* x.pattern);

/** Topics a headline's words point to, strongest first (at most three). */
create function public.classify_topics(title text, preview text default null)
returns text[]
language sql
stable
set search_path = ''
as $$
  with pats as (
    select t.slug, t.sort_order, '\m(?:' || string_agg(k.term, '|' order by k.term) || ')\M' as re
    from public.topic_terms k
    join public.topics t on t.slug = k.topic
    group by t.slug, t.sort_order
  ), scored as (
    select p.slug, p.sort_order,
           (select count(*) from regexp_matches(coalesce(classify_topics.title, ''), p.re, 'gi')) as in_title,
           (select count(*) from regexp_matches(coalesce(classify_topics.preview, ''), p.re, 'gi')) as in_preview
    from pats p
  )
  select coalesce((array_agg(s.slug order by s.in_title * 2 + s.in_preview desc, s.sort_order))[1:3], '{}')
  from scored s
  where s.in_title > 0 or s.in_preview >= 2
$$;

/** A headline's topics: its feed's topics plus detected ones. General news feeds put the detected topic first. */
create function public.entry_topics(feed_topics text[], title text, preview text default null)
returns text[]
language sql
stable
set search_path = ''
as $$
  with detected as (select public.classify_topics(entry_topics.title, entry_topics.preview) as d),
  merged as (
    select case when coalesce(entry_topics.feed_topics, '{}') <@ array['news'] then d.d || coalesce(entry_topics.feed_topics, '{}')
                else coalesce(entry_topics.feed_topics, '{}') || d.d end as m
    from detected d
  )
  select coalesce(array_agg(u.t order by u.n), '{}')
  from (select x.t, min(x.n) as n from merged, unnest(merged.m) with ordinality as x(t, n) group by x.t) u
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

/** Re-file every stored headline (after editing topic_terms or a feed's topics). Producer only. */
create function public.reclassify_entries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  -- Website callers must be the producer; SQL sessions (no signed-in user) are the producer's own.
  if auth.uid() is not null and (select public.my_role())::text is distinct from 'producer' then
    raise exception 'Only the producer can re-file headlines' using errcode = '42501';
  end if;
  update public.feed_entries e
     set topics = public.entry_topics(f.topics, e.title, e.preview)
    from public.feeds f
   where f.id = e.feed_id
     and e.topics is distinct from public.entry_topics(f.topics, e.title, e.preview);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.reclassify_entries() from public, anon;
grant execute on function public.reclassify_entries() to authenticated;

-- File what's already stored.
update public.feed_entries e
   set topics = public.entry_topics(f.topics, e.title, e.preview)
  from public.feeds f
 where f.id = e.feed_id;

create or replace function public.prune_feed_entries()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.feed_entries e
    where coalesce(e.published_at, e.created_at) < now() - interval '45 days'
      and e.item_id is null
      and not exists (select 1 from public.source_feedback sf where sf.entry_id = e.id)
    returning 1
  )
  select count(*)::integer from gone
$$;

-- worker_sources gains "backfill" (new return column, so drop and recreate).
drop function public.worker_sources(text);
create function public.worker_sources(token text)
returns table (id uuid, name text, kind text, url text, input_url text, resolved boolean,
               etag text, last_modified text, topics text[], backfill boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.ingest_token_ok(worker_sources.token) then
    raise exception 'Invalid or revoked ingest token' using errcode = '28000';
  end if;
  update public.ingest_state s set worker_last_run_at = now() where s.id;   -- alias: "id" is also an output column
  return query
    select f.id, f.name, f.kind, f.url, f.input_url, f.resolved, f.etag, f.last_modified, f.topics,
           f.backfilled_at is null
    from public.feeds f where f.active
    order by (f.backfilled_at is null) desc, f.last_fetched_at nulls first;
end;
$$;
revoke execute on function public.worker_sources(text) from public;
grant execute on function public.worker_sources(text) to anon, authenticated;

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
    where i.published_at is null or i.published_at > now() - interval '35 days'
    on conflict on constraint feed_entries_url_unique do update
      set views = coalesce(excluded.views, public.feed_entries.views)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into added from ins;

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

-- Stories now carry several topics; file each under its first one that the caller asked for.
create or replace function public.producer_digest(days integer default 3, per_topic integer default 4, only_topics text[] default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with recent as (
    select s.*,
           -- File each story under its first topic (or its first topic among only_topics).
           coalesce((select u.t from unnest(s.topics) with ordinality as u(t, n)
                     where producer_digest.only_topics is null or u.t = any(producer_digest.only_topics)
                     order by u.n limit 1), 'news') as topic,
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
