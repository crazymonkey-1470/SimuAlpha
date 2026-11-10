-- Crew board fixes (reported by the producer: "it says I haven't added or starred anything").
-- 1. Items saved straight into the database are run by the producer (pasting Grok's picks or their own),
--    so they are credited to the producer, not "Grok". The 18 existing ones move to the producer.
--    Grok keeps credit for what it records itself: verified reads and research answers.
-- 2. The board counts all activity: Feed likes ("More like this"), "Discuss this", not-interested
--    votes, episodes planned, quotes added and days marked on the calendar, besides items, stars, comments.

/** The producer's profile, if there is exactly one (null otherwise). */
create function public.sole_producer()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) = 1 then (array_agg(p.id))[1] end from public.profiles p where p.role = 'producer'
$$;
revoke execute on function public.sole_producer() from public, anon, authenticated;

create or replace function public.items_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.added_by := auth.uid();
    new.added_by_role := coalesce(public.my_role(), 'host');
  elsif new.added_by is not null then
    new.added_by_role := coalesce(
      (select role from public.profiles where id = new.added_by),
      new.added_by_role);
  else
    -- Saved straight into the database (SQL editor / Grok's commands): that's the producer's doing.
    new.added_by := public.sole_producer();
    new.added_by_role := 'producer';
  end if;
  return new;
end;
$$;

update public.items
   set added_by = public.sole_producer()
 where added_by is null and added_by_role = 'producer' and public.sole_producer() is not null;

drop function public.crew_board(integer);
/** Contributions per crew member and Grok over the last `days` days (null = all time). */
create function public.crew_board(days integer default null)
returns table (member_id uuid, name text, added integer, from_feed integer, nominated integer, on_air integer,
               stars_received integer, comments integer, stars_given integer, liked integer, passed integer,
               episodes integer, quotes integer, days_marked integer, research integer, reads integer,
               activity integer, last_active timestamptz)
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
  ), fb as (
    select sf.member_id, sf.kind, sf.created_at from public.source_feedback sf, since where sf.created_at >= since.t
  ), counts as (
    select pe.member_id, pe.name,
      (select count(*) from it where it.who = pe.who)::integer as added,
      (select count(*) from fb where fb.member_id = pe.member_id and fb.kind = 'discuss')::integer as from_feed,
      (select count(*) from it where it.who = pe.who and it.status in ('this_week', 'used'))::integer as nominated,
      (select count(*) from it where it.who = pe.who and it.status = 'used')::integer as on_air,
      (select count(*) from public.item_highlights h join it on it.id = h.item_id where it.who = pe.who)::integer as stars_received,
      (select count(*) from public.comments c, since
        where c.created_at >= since.t
          and coalesce(c.author_id::text, case when c.author_role = 'producer' then 'grok' end) = pe.who)::integer as comments,
      (select count(*) from public.item_highlights h, since where h.user_id = pe.member_id and h.created_at >= since.t)::integer as stars_given,
      (select count(*) from fb where fb.member_id = pe.member_id and fb.kind = 'more_like_this')::integer as liked,
      (select count(*) from fb where fb.member_id = pe.member_id and fb.kind = 'not_interested')::integer as passed,
      (select count(*) from public.episodes e, since where e.created_by = pe.member_id and e.created_at >= since.t)::integer as episodes,
      (select count(*) from public.quotes q, since where q.added_by = pe.member_id and q.created_at >= since.t)::integer as quotes,
      (select count(*) from public.availability a, since where a.member_id = pe.member_id and a.updated_at >= since.t)::integer as days_marked,
      case when pe.member_id is null
           then (select count(*) from public.research_requests r, since
                  where r.status = 'done' and r.answered_at >= since.t and coalesce(r.answered_by, 'Grok') ilike 'grok')
           else (select count(*) from public.research_requests r, since
                  where r.requested_by = pe.member_id and r.created_at >= since.t)
      end::integer as research,
      case when pe.member_id is null
           then (select count(*) from public.article_reads ar, since where ar.read_by ilike 'grok' and ar.checked_at >= since.t)
           else 0
      end::integer as reads,
      greatest(
        (select max(it.created_at) from it where it.who = pe.who),
        (select max(fb.created_at) from fb where fb.member_id = pe.member_id),
        (select max(h.created_at) from public.item_highlights h where h.user_id = pe.member_id),
        (select max(c.created_at) from public.comments c where c.author_id = pe.member_id),
        (select max(a.updated_at) from public.availability a where a.member_id = pe.member_id),
        (select max(e.created_at) from public.episodes e where e.created_by = pe.member_id),
        case when pe.member_id is null then (select max(ar.checked_at) from public.article_reads ar where ar.read_by ilike 'grok') end
      ) as last_active
    from people pe
  )
  select c.member_id, c.name, c.added, c.from_feed, c.nominated, c.on_air, c.stars_received, c.comments, c.stars_given,
         c.liked, c.passed, c.episodes, c.quotes, c.days_marked, c.research, c.reads,
         (c.added + c.comments + c.stars_given + c.liked + c.passed + c.episodes + c.quotes + c.days_marked
          + c.research + c.reads)::integer as activity,
         c.last_active
  from counts c
  order by c.added desc, 17 desc, c.name
$$;
revoke execute on function public.crew_board(integer) from public, anon;
grant execute on function public.crew_board(integer) to authenticated;
