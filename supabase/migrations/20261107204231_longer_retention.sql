-- Keep headlines longer, within a size budget.
-- Each headline costs about 1.7 KB with its indexes. Expect roughly 1,500 a day from 56 sources,
-- about 75 MB a month. Defaults:
--   keep_days     = 365     headlines nobody acted on are kept up to a year...
--   max_headlines = 150000  ...but never more than this many (about 255 MB): the oldest go first.
-- On Supabase Free (500 MB database) that is roughly 3-4 months. On Pro, raise the cap for a full year:
--   update ingest_state set max_headlines = 600000 where id;
-- Items in the prep room, headlines with crew votes, and Grok's reads and memories are never pruned.

alter table public.ingest_state
  add column keep_days integer not null default 365 check (keep_days between 14 and 3650),
  add column max_headlines integer not null default 150000 check (max_headlines >= 1000);

create index if not exists feed_entries_seen_idx on public.feed_entries ((coalesce(published_at, created_at)));

create or replace function public.prune_feed_entries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  keep  integer;
  cap   integer;
  n     integer := 0;
  extra integer;
begin
  select s.keep_days, s.max_headlines into keep, cap from public.ingest_state s where s.id;
  keep := coalesce(keep, 365);
  cap := coalesce(cap, 150000);

  delete from public.feed_entries e
  where coalesce(e.published_at, e.created_at) < now() - make_interval(days => keep)
    and e.item_id is null
    and not exists (select 1 from public.source_feedback sf where sf.entry_id = e.id);
  get diagnostics n = row_count;

  select count(*) - cap into extra from public.feed_entries;
  if extra > 0 then
    delete from public.feed_entries e
    where e.id in (
      select x.id from public.feed_entries x
      where x.item_id is null
        and not exists (select 1 from public.source_feedback sf where sf.entry_id = x.id)
      order by coalesce(x.published_at, x.created_at)
      limit extra);
    get diagnostics extra = row_count;
    n := n + extra;
  end if;
  return n;
end;
$$;

create or replace view public.source_inbox
with (security_invoker = true)
as
with entries as (
  select e.*, f.name as source_name
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

/** Search the whole headline archive (every word must appear in the title). */
create function public.search_headlines(query text default null, since date default null, until date default null,
                                        topic text default null, max_results integer default 50)
returns table (published date, source text, title text, url text, topics text[], in_prep boolean, story_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(e.published_at, e.created_at)::date, f.name, e.title, e.url, e.topics, e.item_id is not null, e.story_id
  from public.feed_entries e
  join public.feeds f on f.id = e.feed_id
  where (search_headlines.since is null or coalesce(e.published_at, e.created_at) >= search_headlines.since)
    and (search_headlines.until is null or coalesce(e.published_at, e.created_at) < search_headlines.until + 1)
    and (search_headlines.topic is null or search_headlines.topic = any(e.topics))
    and not exists (
      select 1 from regexp_split_to_table(public.story_key(search_headlines.query), ' ') w
      where w <> '' and e.title_key !~ ('\m' || w))   -- word-prefix match: "pope" finds "pope", "popes"
  order by coalesce(e.published_at, e.created_at) desc
  limit least(greatest(coalesce(search_headlines.max_results, 50), 1), 200)
$$;
revoke execute on function public.search_headlines(text, date, date, text, integer) from public, anon;
grant execute on function public.search_headlines(text, date, date, text, integer) to authenticated;
