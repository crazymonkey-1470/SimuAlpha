-- Episode calendar + crew availability.
-- Each crew member marks days Free / Maybe / Busy (optionally with a note). The Episodes page shows a month
-- calendar with every episode on its recording date and everyone's availability per day.
-- crew_availability() gives Grok (and anyone in SQL) the same picture to suggest recording dates.

create type public.availability_status as enum ('free', 'maybe', 'busy');

create table public.availability (
  member_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day        date not null,
  status     public.availability_status not null,
  note       text check (note is null or length(note) <= 200),
  updated_at timestamptz not null default now(),
  primary key (member_id, day)
);
create index availability_day_idx on public.availability (day);
create trigger availability_updated_at before update on public.availability
  for each row execute function public.set_updated_at();

alter table public.availability enable row level security;
create policy "members read availability" on public.availability for select to authenticated
  using ((select public.is_member()));
create policy "members set their own availability" on public.availability for insert to authenticated
  with check ((select public.is_member()) and (member_id = (select auth.uid()) or (select public.my_role()) = 'producer'));
create policy "members change their own availability" on public.availability for update to authenticated
  using (member_id = (select auth.uid()) or (select public.my_role()) = 'producer')
  with check (member_id = (select auth.uid()) or (select public.my_role()) = 'producer');
create policy "members clear their own availability" on public.availability for delete to authenticated
  using (member_id = (select auth.uid()) or (select public.my_role()) = 'producer');
revoke all on public.availability from anon, authenticated;
grant select, insert, update, delete on public.availability to authenticated;

/** Each day from from_day: who is free / maybe / busy / hasn't said, whether all are free, and episodes that day. */
create function public.crew_availability(from_day date default current_date, days integer default 42)
returns table (day date, free text[], maybe text[], busy text[], not_set text[], everyone_free boolean, episodes text[])
language sql
stable
security invoker
set search_path = ''
as $$
  with d as (
    select g::date as day
    from generate_series(crew_availability.from_day,
                         crew_availability.from_day + (greatest(1, least(coalesce(crew_availability.days, 42), 366)) - 1),
                         interval '1 day') g
  )
  select d.day,
         coalesce(array_agg(p.display_name order by p.display_name) filter (where a.status = 'free'), '{}'),
         coalesce(array_agg(p.display_name order by p.display_name) filter (where a.status = 'maybe'), '{}'),
         coalesce(array_agg(p.display_name order by p.display_name) filter (where a.status = 'busy'), '{}'),
         coalesce(array_agg(p.display_name order by p.display_name) filter (where a.status is null), '{}'),
         count(p.id) > 0 and bool_and(coalesce(a.status = 'free', false)),
         coalesce((select array_agg(e.title order by e.title) from public.episodes e where e.recording_date = d.day), '{}')
  from d
  cross join public.profiles p
  left join public.availability a on a.member_id = p.id and a.day = d.day
  group by d.day
  order by d.day
$$;
revoke execute on function public.crew_availability(date, integer) from public, anon;
grant execute on function public.crew_availability(date, integer) to authenticated;
