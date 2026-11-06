-- Highlights, topic ideas, and a research queue for the Grok bot.

-- ---------------------------------------------------------------------------
-- "Topic idea": a pitch for something to cover, usually without a link.
-- ---------------------------------------------------------------------------
alter type public.item_type add value if not exists 'topic_idea';

-- ---------------------------------------------------------------------------
-- Highlights: each crew member can star items they find interesting.
-- ---------------------------------------------------------------------------
create table public.item_highlights (
  item_id    uuid not null references public.items (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);
create index item_highlights_user_idx on public.item_highlights (user_id);

-- ---------------------------------------------------------------------------
-- Research requests: notes / jobs for the Grok bot (or anyone) to come back on.
-- ---------------------------------------------------------------------------
create type public.research_kind   as enum ('deep_research', 'stats', 'fact_check', 'counterpoints', 'guest_lookup', 'other');
create type public.research_status as enum ('open', 'in_progress', 'done', 'cancelled');

create table public.research_requests (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid references public.items (id) on delete cascade,
  episode_id        uuid references public.episodes (id) on delete set null,
  kind              public.research_kind not null default 'deep_research',
  request           text not null check (btrim(request) <> ''),
  status            public.research_status not null default 'open',
  requested_by      uuid references public.profiles (id) on delete set null,
  requested_by_role public.member_role not null default 'producer',
  response          text,
  sources           text[] not null default '{}',
  answered_by       text,
  answered_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.research_requests is
  'Jobs for the Grok bot: deeper research, stats, fact checks. Answer with answer_research().';
create index research_requests_status_idx       on public.research_requests (status, created_at);
create index research_requests_item_idx         on public.research_requests (item_id);
create index research_requests_episode_idx      on public.research_requests (episode_id);
create index research_requests_requested_by_idx on public.research_requests (requested_by);

create trigger research_requests_updated_at
  before update on public.research_requests
  for each row execute function public.set_updated_at();

-- Requester comes from the session; an answer stamps answered_at and closes the request.
create function public.research_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.requested_by := auth.uid();
      new.requested_by_role := coalesce(public.my_role(), 'host');
    elsif new.requested_by is not null then
      new.requested_by_role := coalesce(
        (select role from public.profiles where id = new.requested_by), new.requested_by_role);
    end if;
  end if;

  if nullif(btrim(new.response), '') is not null
     and (tg_op = 'INSERT' or new.response is distinct from old.response) then
    new.answered_at := now();
    if new.answered_by is null then
      new.answered_by := coalesce(
        (select display_name from public.profiles where id = auth.uid()), 'Grok');
    end if;
    if new.status in ('open', 'in_progress') then
      new.status := 'done';
    end if;
  end if;
  return new;
end;
$$;

create trigger research_before_write
  before insert or update on public.research_requests
  for each row execute function public.research_before_write();

-- What the bot reads: open work with the item / episode context it needs.
create view public.research_queue
with (security_invoker = true)
as
select
  r.id,
  r.kind,
  r.request,
  r.status,
  r.created_at,
  coalesce(p.display_name, initcap(r.requested_by_role::text)) as requested_by_name,
  r.item_id,
  i.title          as item_title,
  i.url            as item_url,
  i.source         as item_source,
  i.summary        as item_summary,
  i.talking_points as item_talking_points,
  r.episode_id,
  e.title          as episode_title
from public.research_requests r
left join public.items    i on i.id = r.item_id
left join public.episodes e on e.id = r.episode_id
left join public.profiles p on p.id = r.requested_by
where r.status in ('open', 'in_progress')
order by r.created_at;

-- What the bot writes: one call per answer.
create function public.answer_research(
  request_id  uuid,
  response    text,
  sources     text[] default '{}',
  answered_by text default 'Grok'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if nullif(btrim(answer_research.response), '') is null then
    raise exception 'response must not be empty' using errcode = 'check_violation';
  end if;
  update public.research_requests r
     set response    = answer_research.response,
         sources     = coalesce(answer_research.sources, '{}'),
         answered_by = answer_research.answered_by,
         status      = 'done'
   where r.id = answer_research.request_id;
  if not found then
    raise exception 'No research request with id %', answer_research.request_id
      using errcode = 'no_data_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- item_cards / this_week gain highlight + research counts (appended columns).
-- ---------------------------------------------------------------------------
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
  coalesce(p.display_name, initcap(i.added_by_role::text)) as added_by_name,
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

create or replace view public.this_week
with (security_invoker = true)
as
select * from public.item_cards where status = 'this_week';

-- ---------------------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------------------
alter table public.item_highlights   enable row level security;
alter table public.research_requests enable row level security;

create policy "members read highlights" on public.item_highlights for select to authenticated
  using ((select public.is_member()));
create policy "highlight as yourself"   on public.item_highlights for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "remove own highlight"    on public.item_highlights for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "members read research"   on public.research_requests for select to authenticated
  using ((select public.is_member()));
create policy "members request research" on public.research_requests for insert to authenticated
  with check ((select public.is_member()));
create policy "members update research" on public.research_requests for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy "requester or producer deletes research" on public.research_requests for delete to authenticated
  using ((select public.is_member())
         and (requested_by = (select auth.uid()) or (select public.my_role()) = 'producer'));

revoke all on public.item_highlights, public.research_requests, public.research_queue
  from anon, authenticated;
grant select, insert, delete on public.item_highlights to authenticated;
grant select, insert, delete on public.research_requests to authenticated;
grant update (item_id, episode_id, kind, request, status, response, sources, answered_by)
  on public.research_requests to authenticated;
grant select on public.research_queue to authenticated;

revoke all on public.item_cards, public.this_week from anon;
grant select on public.item_cards, public.this_week to authenticated;

revoke execute on function public.answer_research(uuid, text, text[], text) from public, anon;
grant execute on function public.answer_research(uuid, text, text[], text) to authenticated;
