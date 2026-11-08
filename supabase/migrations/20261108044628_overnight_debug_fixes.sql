-- Overnight debug fixes. Nothing is deleted; existing headlines are only regrouped.
--
-- 1. Duplicate cards: the same source repeating the exact headline within 3 days (Google News giving
--    one article two links; the month backfill overlapping a site's own feed; a site re-posting under a
--    new address) now joins the same story, and "N outlets" counts sources, not copies.
-- 2. Junk filter: shopping round-ups, gift guides, horoscopes and subscription promos found in the data.
-- 3. Hardening from the Supabase advisors:
--    - touch_memories() checks membership;
--    - trigger functions can't be called over the API;
--    - quotes.added_by is indexed;
--    - producer write policies on topic_terms/entry_filters are split per action (no duplicate SELECT policy).

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
  select e.story_id into match
  from public.feed_entries e
  where coalesce(e.published_at, e.created_at) between ts - interval '3 days' and ts + interval '3 days'
    and length(key) > 12
    and case when e.feed_id = new.feed_id then e.title_key = key
             else extensions.similarity(e.title_key, key) >= 0.42 end
  order by extensions.similarity(e.title_key, key) desc
  limit 1;
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
         count(distinct feed_id)::integer as outlet_count,   -- sources, not copies
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

-- Regroup duplicates already stored (story ids only; no rows removed).
do $$
declare
  r record;
begin
  loop
    select a.story_id as keep, b.story_id as merge into r
    from public.feed_entries a
    join public.feed_entries b
      on b.feed_id = a.feed_id and b.title_key = a.title_key and b.story_id <> a.story_id
    where length(a.title_key) > 12
      and abs(extract(epoch from coalesce(a.published_at, a.created_at) - coalesce(b.published_at, b.created_at))) <= 3 * 86400
      and (coalesce(a.published_at, a.created_at), a.id) < (coalesce(b.published_at, b.created_at), b.id)
    limit 1;
    exit when not found;
    update public.feed_entries set story_id = r.keep where story_id = r.merge;
  end loop;
end;
$$;

insert into public.entry_filters (pattern, note) values
  ('\m(deals and steals|sitewide sales?|i[’'']m shopping|shoppers can[’'']t miss|on sale now)\M', 'shopping round-ups'),
  ('\m\d+ (best|top|favorite) [^.]{0,50}\m(gifts?|deals?|buys|products|finds)\M', 'listicle shopping'),
  ('\mbest [^.]{0,40}\mgifts?\M', 'gift guides'),
  ('\m(deals?|sales?) (on|at) [^.]{0,40}\m(sephora|ulta|amazon|walmart|target|costco|best buy|nordstrom)\M', 'retailer deals'),
  ('^\d+ [^.]{0,40}\mdeals\M', 'numbered deal lists'),
  ('\mhoroscopes?\M|\mastrology\M', 'horoscopes'),
  ('^the wall street journal for\M', 'WSJ subscription promo')
on conflict do nothing;

create or replace function public.touch_memories(ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.memories set access_count = access_count + 1, last_accessed_at = now()
  where id = any(touch_memories.ids)
    and ((select auth.uid()) is null or (select public.is_member()))   -- Grok's SQL sessions, or crew on the site
$$;

revoke execute on function
  public.comments_before_insert(), public.entry_filters_check(), public.episodes_default_quote(),
  public.feed_entries_before_insert(), public.items_auto_topic(), public.items_before_insert(),
  public.items_guard_content(), public.memories_before_insert(), public.on_allowed_email_change(),
  public.on_auth_user_change(), public.quotes_before_write(), public.research_before_write(),
  public.set_creator(), public.set_updated_at(), public.topic_terms_check()
from public, anon, authenticated;

create index if not exists quotes_added_by_idx on public.quotes (added_by);

drop policy "producer edits topic terms" on public.topic_terms;
create policy "producer adds topic terms"    on public.topic_terms for insert to authenticated with check ((select public.my_role()) = 'producer');
create policy "producer changes topic terms" on public.topic_terms for update to authenticated
  using ((select public.my_role()) = 'producer') with check ((select public.my_role()) = 'producer');
create policy "producer removes topic terms" on public.topic_terms for delete to authenticated using ((select public.my_role()) = 'producer');

drop policy "producer edits entry filters" on public.entry_filters;
create policy "producer adds entry filters"    on public.entry_filters for insert to authenticated with check ((select public.my_role()) = 'producer');
create policy "producer changes entry filters" on public.entry_filters for update to authenticated
  using ((select public.my_role()) = 'producer') with check ((select public.my_role()) = 'producer');
create policy "producer removes entry filters" on public.entry_filters for delete to authenticated using ((select public.my_role()) = 'producer');
