-- Grok's second brain: long-term memory, conversation history, and briefings.
--
-- Design (after Mem0 / Zep-Graphiti / Letta / Generative Agents):
--   memories          distilled, typed memories (preference, fact, event, instruction, reflection)
--                     about a crew member, a topic, an item, an episode, an outside entity, or the show.
--                     Never hard-overwritten: contradictions retire the old row (invalid_at, superseded_by).
--                     Duplicates are reinforced instead of re-inserted.
--   conversations /   raw long-context history of talks with Grok (any channel), searchable.
--   conversation_messages
--   recall()          ranked retrieval: full-text + fuzzy match + importance + recency + pins.
--   member_briefing() one call before answering someone: who they are, what they like, what they asked.
--   show_briefing()   show-wide context: standing instructions, what has already been covered.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
-- Supabase already grants this; explicit so fuzzy matching works for signed-in users anywhere.
grant usage on schema extensions to authenticated;

create type public.memory_kind   as enum ('preference', 'fact', 'event', 'instruction', 'reflection');
create type public.memory_source as enum ('grok', 'member', 'producer', 'system');

create function public.memory_search_text(content text, tags text[], entity text)
returns text
language sql
immutable
set search_path = ''
as $$
  select concat_ws(' ', content, array_to_string(tags, ' '), entity)
$$;

create table public.memories (
  id                 uuid primary key default gen_random_uuid(),
  kind               public.memory_kind not null default 'fact',
  content            text not null check (btrim(content) <> '' and length(content) <= 2000),
  about_member       uuid references public.profiles (id) on delete cascade,
  about_topic        text references public.topics (slug) on update cascade on delete set null,
  about_item         uuid references public.items (id) on delete cascade,
  about_episode      uuid references public.episodes (id) on delete cascade,
  about_entity       text,
  tags               text[] not null default '{}',
  importance         smallint not null default 5 check (importance between 1 and 10),
  confidence         real not null default 0.8 check (confidence between 0 and 1),
  pinned             boolean not null default false,
  source             public.memory_source not null default 'grok',
  created_by         uuid references public.profiles (id) on delete set null,
  evidence           text,
  source_research    uuid references public.research_requests (id) on delete set null,
  source_item        uuid references public.items (id) on delete set null,
  valid_from         timestamptz not null default now(),
  invalid_at         timestamptz,
  superseded_by      uuid references public.memories (id) on delete set null,
  retired_reason     text,
  reinforced_count   integer not null default 0,
  last_reinforced_at timestamptz,
  access_count       integer not null default 0,
  last_accessed_at   timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  search             tsvector generated always as (
                       to_tsvector('english'::regconfig, public.memory_search_text(content, tags, about_entity))
                     ) stored
);
comment on table public.memories is
  'Grok''s long-term memory. Write with remember(), correct with revise_memory(), retire with forget(), read with recall() / member_briefing() / show_briefing().';
create index memories_search_idx  on public.memories using gin (search);
create index memories_trgm_idx    on public.memories using gin (content extensions.gin_trgm_ops);
create index memories_member_idx  on public.memories (about_member) where invalid_at is null;
create index memories_topic_idx   on public.memories (about_topic) where invalid_at is null;
create index memories_item_idx    on public.memories (about_item);
create index memories_episode_idx on public.memories (about_episode);
create index memories_kind_idx    on public.memories (kind, created_at desc) where invalid_at is null;
create index memories_created_by_idx on public.memories (created_by);
create index memories_research_idx   on public.memories (source_research);
create index memories_src_item_idx   on public.memories (source_item);
create index memories_superseded_idx on public.memories (superseded_by);

create trigger memories_updated_at before update on public.memories
  for each row execute function public.set_updated_at();

create function public.memories_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.source := case when public.my_role() = 'producer' then 'producer' else 'member' end;
  end if;
  new.content := btrim(new.content);
  return new;
end;
$$;
create trigger memories_before_insert before insert on public.memories
  for each row execute function public.memories_before_insert();

-- Conversation history (long context). Bots log whole sessions with log_conversation().
create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid references public.profiles (id) on delete cascade,
  channel    text not null default 'grok',
  title      text,
  summary    text,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  created_at timestamptz not null default now()
);
create index conversations_member_idx on public.conversations (member_id, started_at desc);

create table public.conversation_messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content         text not null,
  created_at      timestamptz not null default now(),
  search          tsvector generated always as (to_tsvector('english'::regconfig, content)) stored
);
create index conversation_messages_conv_idx   on public.conversation_messages (conversation_id, id);
create index conversation_messages_search_idx on public.conversation_messages using gin (search);

-- ---------------------------------------------------------------------------
-- Writing memory
-- ---------------------------------------------------------------------------
create function public.check_topic_slug(slug text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if slug is not null and not exists (select 1 from public.topics t where t.slug = check_topic_slug.slug) then
    raise exception 'Unknown topic slug: %. Valid slugs: %.', slug,
      (select string_agg(t.slug, ', ' order by t.sort_order) from public.topics t)
      using errcode = 'foreign_key_violation';
  end if;
end;
$$;

-- Store a memory. If an active memory of the same kind about the same subject already says
-- nearly the same thing (fuzzy similarity >= 0.6), it is reinforced instead of duplicated.
create function public.remember(
  content         text,
  kind            public.memory_kind default 'fact',
  about_member    uuid default null,
  about_topic     text default null,
  about_item      uuid default null,
  about_episode   uuid default null,
  about_entity    text default null,
  importance      integer default 5,
  tags            text[] default '{}',
  pinned          boolean default false,
  evidence        text default null,
  confidence      real default 0.8,
  source_research uuid default null,
  source_item     uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing uuid;
  new_id   uuid;
begin
  perform public.check_topic_slug(remember.about_topic);

  select m.id into existing
  from public.memories m
  where m.invalid_at is null
    and m.kind = remember.kind
    and m.about_member  is not distinct from remember.about_member
    and m.about_topic   is not distinct from remember.about_topic
    and m.about_item    is not distinct from remember.about_item
    and m.about_episode is not distinct from remember.about_episode
    and lower(coalesce(m.about_entity, '')) = lower(coalesce(remember.about_entity, ''))
    and extensions.similarity(lower(m.content), lower(btrim(remember.content))) >= 0.6
  order by extensions.similarity(lower(m.content), lower(btrim(remember.content))) desc
  limit 1;

  if existing is not null then
    update public.memories m
       set reinforced_count   = m.reinforced_count + 1,
           last_reinforced_at = now(),
           importance         = greatest(m.importance, least(10, greatest(1, remember.importance))),
           confidence         = least(1, greatest(m.confidence, remember.confidence) + 0.05),
           pinned             = m.pinned or remember.pinned,
           tags               = (select coalesce(array_agg(distinct t), '{}') from unnest(m.tags || coalesce(remember.tags, '{}')) t)
     where m.id = existing;
    return existing;
  end if;

  insert into public.memories (content, kind, about_member, about_topic, about_item, about_episode, about_entity,
                               importance, tags, pinned, evidence, confidence, source_research, source_item)
  values (remember.content, remember.kind, remember.about_member, remember.about_topic, remember.about_item,
          remember.about_episode, nullif(btrim(remember.about_entity), ''),
          least(10, greatest(1, remember.importance)), coalesce(remember.tags, '{}'), remember.pinned,
          remember.evidence, remember.confidence, remember.source_research, remember.source_item)
  returning id into new_id;
  return new_id;
end;
$$;

-- Correct a memory: the old one is retired (kept for history), a new one replaces it.
create function public.revise_memory(memory_id uuid, new_content text, reason text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old    public.memories;
  new_id uuid;
begin
  select * into old from public.memories m where m.id = revise_memory.memory_id and m.invalid_at is null;
  if not found then
    raise exception 'No active memory with id %', revise_memory.memory_id using errcode = 'no_data_found';
  end if;
  insert into public.memories (content, kind, about_member, about_topic, about_item, about_episode, about_entity,
                               importance, tags, pinned, evidence, confidence)
  values (revise_memory.new_content, old.kind, old.about_member, old.about_topic, old.about_item, old.about_episode,
          old.about_entity, old.importance, old.tags, old.pinned, revise_memory.reason, old.confidence)
  returning id into new_id;
  update public.memories m
     set invalid_at = now(), superseded_by = new_id, retired_reason = coalesce(revise_memory.reason, 'revised')
   where m.id = old.id;
  return new_id;
end;
$$;

-- Retire a memory that is no longer true (kept for history, excluded from recall).
create function public.forget(memory_id uuid, reason text default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.memories m
     set invalid_at = now(), retired_reason = coalesce(forget.reason, 'forgotten')
   where m.id = forget.memory_id and m.invalid_at is null;
  if not found then
    raise exception 'No active memory with id %', forget.memory_id using errcode = 'no_data_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading memory
-- ---------------------------------------------------------------------------
create type public.recalled_memory as (
  id uuid, kind public.memory_kind, content text, subject text, importance smallint,
  confidence real, pinned boolean, tags text[], source public.memory_source,
  created_at timestamptz, score double precision
);

-- Ranking only (no side effects). Score = 4*full-text + 2*fuzzy (when a query is given)
-- + importance/10 + 0.6*recency (~60-day half-life, refreshed by reinforcement)
-- + 0.15*ln(1+reinforcements) + 1 if pinned + 0.3*confidence.
create function public.recall_rank(
  query        text,
  about_member uuid,
  about_topic  text,
  about_item   uuid,
  kinds        public.memory_kind[],
  include_show boolean,
  max_results  integer
)
returns setof public.recalled_memory
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select case when nullif(btrim(recall_rank.query), '') is null then null
                else websearch_to_tsquery('english'::regconfig, recall_rank.query) end as q,
           lower(nullif(btrim(recall_rank.query), '')) as lq
  ), candidates as (
    select m.*,
           case when p.q is null then 0 else ts_rank_cd(m.search, p.q, 32)::double precision end as fts,
           case when p.lq is null then 0 else extensions.word_similarity(p.lq, lower(m.content))::double precision end as fuzzy,
           p.q is null as no_query,
           coalesce(m.search @@ p.q, false) as hit
    from public.memories m, params p
    where m.invalid_at is null
      and (recall_rank.kinds is null or m.kind = any(recall_rank.kinds))
      and (
        (recall_rank.about_member is null and recall_rank.about_topic is null and recall_rank.about_item is null)
        or m.about_member = recall_rank.about_member
        or m.about_topic  = recall_rank.about_topic
        or m.about_item   = recall_rank.about_item
        or (recall_rank.include_show and m.about_member is null and m.about_topic is null
            and m.about_item is null and m.about_episode is null)
      )
  )
  select c.id, c.kind, c.content,
         coalesce(pr.display_name, t.name, i.title, e.title, c.about_entity, 'show'),
         c.importance, c.confidence, c.pinned, c.tags, c.source, c.created_at,
         (4 * c.fts + 2 * c.fuzzy)
         + c.importance / 10.0
         + 0.6 * exp(-extract(epoch from now() - coalesce(c.last_reinforced_at, c.created_at)) / 86400.0 / 87.0)
         + 0.15 * ln(1 + c.reinforced_count)
         + case when c.pinned then 1 else 0 end
         + 0.3 * c.confidence
  from candidates c
  left join public.profiles pr on pr.id = c.about_member
  left join public.topics   t  on t.slug = c.about_topic
  left join public.items    i  on i.id = c.about_item
  left join public.episodes e  on e.id = c.about_episode
  where c.no_query or c.hit or c.fuzzy >= 0.35
  order by 11 desc
  limit greatest(1, least(coalesce(recall_rank.max_results, 12), 100))
$$;

create function public.touch_memories(ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.memories set access_count = access_count + 1, last_accessed_at = now()
  where id = any(ids)
$$;

-- Ranked retrieval that also records what was recalled (access stats feed future ranking/review).
create function public.recall(
  query        text default null,
  about_member uuid default null,
  about_topic  text default null,
  about_item   uuid default null,
  kinds        public.memory_kind[] default null,
  include_show boolean default true,
  max_results  integer default 12
)
returns setof public.recalled_memory
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  results public.recalled_memory[];
begin
  select coalesce(array_agg(r order by r.score desc), '{}') into results
  from public.recall_rank(recall.query, recall.about_member, recall.about_topic, recall.about_item,
                          recall.kinds, recall.include_show, recall.max_results) r;
  perform public.touch_memories(array(select u.id from unnest(results) u));
  return query
    select u.id, u.kind, u.content, u.subject, u.importance, u.confidence, u.pinned, u.tags, u.source,
           u.created_at, u.score
    from unnest(results) with ordinality u
    order by u.ordinality;
end;
$$;

-- Everything Grok should know before answering one person, in one call.
create function public.member_briefing(member uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with mem as (
    select m.* from public.memories m
    where m.invalid_at is null and m.about_member = member_briefing.member
  ), topic_signal as (
    select it.topic_slug, sum(w) as weight
    from (
      select h.item_id, 3 as w from public.item_highlights h
       where h.user_id = member_briefing.member and h.created_at > now() - interval '180 days'
      union all
      select i.id, 2 from public.items i
       where i.added_by = member_briefing.member and i.created_at > now() - interval '180 days'
      union all
      select c.item_id, 1 from public.comments c
       where c.author_id = member_briefing.member and c.created_at > now() - interval '180 days'
      union all
      select r.item_id, 2 from public.research_requests r
       where r.requested_by = member_briefing.member and r.item_id is not null
         and r.created_at > now() - interval '180 days'
    ) s
    join public.item_topics it on it.item_id = s.item_id
    group by it.topic_slug
  )
  select jsonb_build_object(
    'member', (select jsonb_build_object('id', p.id, 'name', p.display_name, 'role', p.role)
                 from public.profiles p where p.id = member_briefing.member),
    'pinned', coalesce((select jsonb_agg(m.content order by m.importance desc) from mem m where m.pinned), '[]'),
    'preferences', coalesce((select jsonb_agg(x.content) from (
        select m.content from mem m where m.kind = 'preference' and not m.pinned
        order by m.importance desc, coalesce(m.last_reinforced_at, m.created_at) desc limit 15) x), '[]'),
    'instructions', coalesce((select jsonb_agg(x.content) from (
        select m.content from mem m where m.kind = 'instruction' and not m.pinned
        order by m.importance desc limit 10) x), '[]'),
    'facts', coalesce((select jsonb_agg(x.content) from (
        select m.content from mem m where m.kind in ('fact', 'reflection') and not m.pinned
        order by m.importance desc, coalesce(m.last_reinforced_at, m.created_at) desc limit 15) x), '[]'),
    'recent_events', coalesce((select jsonb_agg(x.content) from (
        select m.content from mem m where m.kind = 'event' order by m.created_at desc limit 8) x), '[]'),
    'favorite_topics', coalesce((select jsonb_agg(jsonb_build_object('topic', t.name, 'weight', s.weight) order by s.weight desc)
        from (select * from topic_signal order by weight desc limit 6) s join public.topics t on t.slug = s.topic_slug), '[]'),
    'recent_stars', coalesce((select jsonb_agg(x.title) from (
        select i.title from public.item_highlights h join public.items i on i.id = h.item_id
        where h.user_id = member_briefing.member order by h.created_at desc limit 10) x), '[]'),
    'recent_requests', coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'request', x.request, 'status', x.status)) from (
        select r.kind, r.request, r.status from public.research_requests r
        where r.requested_by = member_briefing.member order by r.created_at desc limit 6) x), '[]'),
    'recent_conversations', coalesce((select jsonb_agg(jsonb_build_object('when', x.started_at, 'title', x.title, 'summary', x.summary)) from (
        select c.started_at, c.title, c.summary from public.conversations c
        where c.member_id = member_briefing.member order by c.started_at desc limit 5) x), '[]')
  )
$$;

-- Show-wide context: standing instructions, show facts, recent episodes, what has been covered.
create function public.show_briefing()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with show_mem as (
    select m.* from public.memories m
    where m.invalid_at is null and m.about_member is null and m.about_topic is null
      and m.about_item is null and m.about_episode is null and m.about_entity is null
  )
  select jsonb_build_object(
    'pinned', coalesce((select jsonb_agg(m.content order by m.importance desc) from show_mem m where m.pinned), '[]'),
    'instructions', coalesce((select jsonb_agg(x.content) from (
        select m.content from show_mem m where m.kind = 'instruction' and not m.pinned order by m.importance desc limit 15) x), '[]'),
    'facts', coalesce((select jsonb_agg(x.content) from (
        select m.content from show_mem m where m.kind in ('fact', 'reflection', 'preference') and not m.pinned
        order by m.importance desc, m.created_at desc limit 20) x), '[]'),
    'recent_episodes', coalesce((select jsonb_agg(jsonb_build_object(
          'title', e.title, 'recording_date', e.recording_date, 'status', e.status,
          'items', (select coalesce(jsonb_agg(i.title), '[]') from public.item_episodes ie
                    join public.items i on i.id = ie.item_id where ie.episode_id = e.id))
        order by e.recording_date desc nulls last)
        from (select * from public.episodes order by recording_date desc nulls last limit 8) e), '[]'),
    'recently_covered', coalesce((select jsonb_agg(x.title) from (
        select i.title from public.items i where i.status = 'used' order by i.updated_at desc limit 30) x), '[]'),
    'this_week', coalesce((select jsonb_agg(x.title) from (
        select i.title from public.items i where i.status = 'this_week' order by i.created_at desc) x), '[]'),
    'crew', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'role', p.role))
        from public.profiles p), '[]'),
    'open_research', (select count(*) from public.research_requests r where r.status in ('open', 'in_progress'))
  )
$$;

-- Log a whole conversation in one call. messages: [{"role":"user","content":"..."}, ...]
create function public.log_conversation(
  messages   jsonb,
  member_id  uuid default null,
  title      text default null,
  summary    text default null,
  channel    text default 'grok',
  started_at timestamptz default now()
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  conv_id uuid;
begin
  if jsonb_typeof(log_conversation.messages) <> 'array' then
    raise exception 'messages must be a JSON array of {role, content}' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.conversations (member_id, channel, title, summary, started_at, ended_at)
  values (log_conversation.member_id, coalesce(log_conversation.channel, 'grok'), log_conversation.title,
          log_conversation.summary, coalesce(log_conversation.started_at, now()), now())
  returning id into conv_id;
  insert into public.conversation_messages (conversation_id, role, content)
  select conv_id, coalesce(m->>'role', 'user'), m->>'content'
  from jsonb_array_elements(log_conversation.messages) with ordinality as e(m, ord)
  where nullif(btrim(m->>'content'), '') is not null
  order by ord;
  return conv_id;
end;
$$;

-- Search past conversations (long context).
create function public.search_conversations(query text, member_id uuid default null, max_results integer default 10)
returns table (conversation_id uuid, started_at timestamptz, title text, role text, content text, rank real)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.started_at, c.title, cm.role, cm.content,
         ts_rank_cd(cm.search, websearch_to_tsquery('english'::regconfig, search_conversations.query), 32)
  from public.conversation_messages cm
  join public.conversations c on c.id = cm.conversation_id
  where cm.search @@ websearch_to_tsquery('english'::regconfig, search_conversations.query)
    and (search_conversations.member_id is null or c.member_id = search_conversations.member_id)
  order by 6 desc, c.started_at desc
  limit greatest(1, least(coalesce(max_results, 10), 50))
$$;

-- What the site shows.
create view public.memory_cards
with (security_invoker = true)
as
select m.id, m.kind, m.content, m.about_member, m.about_topic, m.about_item, m.about_episode, m.about_entity,
       m.tags, m.importance, m.confidence, m.pinned, m.source, m.created_by, m.evidence,
       m.invalid_at, m.retired_reason, m.reinforced_count, m.access_count, m.created_at, m.updated_at,
       coalesce(p.display_name, t.name, i.title, e.title, m.about_entity, 'Show') as subject,
       coalesce(cb.display_name, initcap(m.source::text)) as created_by_name
from public.memories m
left join public.profiles p  on p.id = m.about_member
left join public.topics   t  on t.slug = m.about_topic
left join public.items    i  on i.id = m.about_item
left join public.episodes e  on e.id = m.about_episode
left join public.profiles cb on cb.id = m.created_by;

-- research_queue gains the requester id (appended) so a bot can call member_briefing(requested_by).
create or replace view public.research_queue
with (security_invoker = true)
as
select
  r.id, r.kind, r.request, r.status, r.created_at,
  coalesce(p.display_name, initcap(r.requested_by_role::text)) as requested_by_name,
  r.item_id, i.title as item_title, i.url as item_url, i.source as item_source,
  i.summary as item_summary, i.talking_points as item_talking_points,
  r.episode_id, e.title as episode_title,
  r.requested_by
from public.research_requests r
left join public.items    i on i.id = r.item_id
left join public.episodes e on e.id = r.episode_id
left join public.profiles p on p.id = r.requested_by
where r.status in ('open', 'in_progress')
order by r.created_at;

-- ---------------------------------------------------------------------------
-- Privacy: memories about a person are visible to that person and producers only;
-- show / topic / item / episode memories are visible to the whole crew.
-- ---------------------------------------------------------------------------
alter table public.memories              enable row level security;
alter table public.conversations         enable row level security;
alter table public.conversation_messages enable row level security;

create policy "read memories" on public.memories for select to authenticated
  using ((select public.is_member())
         and (about_member is null or about_member = (select auth.uid()) or (select public.my_role()) = 'producer'));
create policy "write memories" on public.memories for insert to authenticated
  with check ((select public.is_member())
              and (about_member is null or about_member = (select auth.uid()) or (select public.my_role()) = 'producer'));
create policy "update memories" on public.memories for update to authenticated
  using ((select public.is_member())
         and (about_member = (select auth.uid()) or created_by = (select auth.uid()) or (select public.my_role()) = 'producer'))
  with check ((select public.is_member())
         and (about_member is null or about_member = (select auth.uid()) or (select public.my_role()) = 'producer'));
create policy "delete memories" on public.memories for delete to authenticated
  using ((select public.is_member())
         and (about_member = (select auth.uid()) or created_by = (select auth.uid()) or (select public.my_role()) = 'producer'));

create policy "read own conversations" on public.conversations for select to authenticated
  using ((select public.is_member()) and (member_id = (select auth.uid()) or (select public.my_role()) = 'producer'));
create policy "delete own conversations" on public.conversations for delete to authenticated
  using ((select public.is_member()) and (member_id = (select auth.uid()) or (select public.my_role()) = 'producer'));
create policy "read own conversation messages" on public.conversation_messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id));

revoke all on public.memories, public.conversations, public.conversation_messages, public.memory_cards
  from anon, authenticated;
grant select, insert, delete on public.memories to authenticated;
grant update (content, kind, tags, importance, pinned, confidence, invalid_at, retired_reason,
              superseded_by, reinforced_count, last_reinforced_at) on public.memories to authenticated;
grant select on public.memory_cards to authenticated;
grant select, delete on public.conversations to authenticated;
grant select on public.conversation_messages to authenticated;
revoke all on public.research_queue from anon;
grant select on public.research_queue to authenticated;

revoke execute on function public.touch_memories(uuid[]) from public, anon;
grant execute on function public.touch_memories(uuid[]) to authenticated;
revoke execute on function public.recall_rank(text, uuid, text, uuid, public.memory_kind[], boolean, integer) from public, anon;
revoke execute on function public.remember(text, public.memory_kind, uuid, text, uuid, uuid, text, integer, text[], boolean, text, real, uuid, uuid) from public, anon;
revoke execute on function public.revise_memory(uuid, text, text) from public, anon;
revoke execute on function public.forget(uuid, text) from public, anon;
revoke execute on function public.recall(text, uuid, text, uuid, public.memory_kind[], boolean, integer) from public, anon;
revoke execute on function public.member_briefing(uuid) from public, anon;
revoke execute on function public.show_briefing() from public, anon;
revoke execute on function public.log_conversation(jsonb, uuid, text, text, text, timestamptz) from public, anon;
revoke execute on function public.search_conversations(text, uuid, integer) from public, anon;
grant execute on function public.recall_rank(text, uuid, text, uuid, public.memory_kind[], boolean, integer),
                          public.remember(text, public.memory_kind, uuid, text, uuid, uuid, text, integer, text[], boolean, text, real, uuid, uuid),
                          public.revise_memory(uuid, text, text),
                          public.forget(uuid, text),
                          public.recall(text, uuid, text, uuid, public.memory_kind[], boolean, integer),
                          public.member_briefing(uuid),
                          public.show_briefing(),
                          public.search_conversations(text, uuid, integer)
  to authenticated;
