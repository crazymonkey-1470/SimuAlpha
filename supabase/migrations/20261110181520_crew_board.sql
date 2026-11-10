-- Credit and the crew board.
-- 1. Items saved straight into the database (no signed-in member: Grok's SQL via the producer) are credited
--    to "Grok" instead of "Producer". Items of a removed member read "Former crew member".
-- 2. crew_board(days): who added what over a period, and how it did (nominated, on air, stars, comments).

create or replace view public.item_cards
with (security_invoker = true)
as
select
  i.*,
  coalesce(
    (select array_agg(it.topic_slug order by t.sort_order)
       from public.item_topics it
       join public.topics t on t.slug = it.topic_slug
      where it.item_id = i.id),
    '{}') as topics,
  coalesce(
    (select array_agg(ie.episode_id) from public.item_episodes ie where ie.item_id = i.id),
    '{}') as episode_ids,
  (select count(*) from public.comments c where c.item_id = i.id)::integer as comment_count,
  -- Items saved straight into the database (no signed-in crew member) are Grok's picks.
  coalesce(p.display_name,
           case when i.added_by is null and i.added_by_role = 'producer' then 'Grok' else 'Former crew member' end) as added_by_name,
  coalesce(
    (select array_agg(h.user_id order by h.created_at) from public.item_highlights h where h.item_id = i.id),
    '{}') as highlighted_by,
  (select count(*) from public.item_highlights h where h.item_id = i.id)::integer as highlight_count,
  (select count(*) from public.research_requests r
    where r.item_id = i.id and r.status in ('open', 'in_progress'))::integer as research_open,
  (select count(*) from public.research_requests r
    where r.item_id = i.id and r.status = 'done')::integer as research_done
from public.items i
left join public.profiles p on p.id = i.added_by;

/** Contributions per crew member and Grok over the last `days` days (null = all time), most added first. */
create function public.crew_board(days integer default null)
returns table (member_id uuid, name text, added integer, from_feed integer, nominated integer, on_air integer,
               stars_received integer, comments integer, stars_given integer, research integer, last_added timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  with since as (
    select case when crew_board.days is null then '-infinity'::timestamptz
                else now() - make_interval(days => greatest(1, crew_board.days)) end as t
  ), people as (
    select p.id as member_id, p.display_name as name, p.id::text as who from public.profiles p
    union all
    select null::uuid, 'Grok', 'grok'
  ), it as (
    select i.id, i.status, i.created_at,
           coalesce(i.added_by::text, case when i.added_by_role = 'producer' then 'grok' end) as who
    from public.items i, since
    where i.created_at >= since.t
  )
  select pe.member_id, pe.name,
         (select count(*) from it where it.who = pe.who)::integer,
         (select count(*) from public.source_feedback sf, since
           where sf.member_id = pe.member_id and sf.kind = 'discuss' and sf.created_at >= since.t)::integer,
         (select count(*) from it where it.who = pe.who and it.status in ('this_week', 'used'))::integer,
         (select count(*) from it where it.who = pe.who and it.status = 'used')::integer,
         (select count(*) from public.item_highlights h join it on it.id = h.item_id where it.who = pe.who)::integer,
         (select count(*) from public.comments c, since
           where c.created_at >= since.t
             and coalesce(c.author_id::text, case when c.author_role = 'producer' then 'grok' end) = pe.who)::integer,
         (select count(*) from public.item_highlights h, since
           where h.user_id = pe.member_id and h.created_at >= since.t)::integer,
         -- research: questions asked (crew) or answered (Grok)
         case when pe.member_id is null
              then (select count(*) from public.research_requests r, since
                     where r.status = 'done' and r.answered_at >= since.t and coalesce(r.answered_by, 'Grok') ilike 'grok')
              else (select count(*) from public.research_requests r, since
                     where r.requested_by = pe.member_id and r.created_at >= since.t)
         end::integer,
         (select max(it.created_at) from it where it.who = pe.who)
  from people pe
  order by 3 desc, 2
$$;
revoke execute on function public.crew_board(integer) from public, anon;
grant execute on function public.crew_board(integer) to authenticated;
