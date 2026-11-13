-- Grok desk, show sheet, after-the-show and "covered before".
--
-- 1. grok_brief(): one call with everything Grok needs (next episode and what it still needs, research
--    queue, who's free, the sorted news, host tastes). The site copies it with reply instructions.
-- 2. apply_grok_reply(json): saves Grok's structured reply (picks, research answers, verified reads,
--    memories, quote, nominations, show notes) with the caller's own permissions. Each part succeeds or
--    fails on its own and is reported back. No SQL from the reply is ever run.
-- 3. items.grok_pick marks items that came in through a Grok reply (credit stays with whoever applied it).
-- 4. Show sheet: item_episodes.position + set_running_order().
-- 5. After the show: episodes.watch_url / listen_url / show_notes; when an episode becomes recorded or
--    published, its attached items are marked used.
-- 6. covered_before(title, url): similar items already in the prep room or aired, and when the story
--    first appeared in the news.

alter table public.items add column grok_pick boolean not null default false;
alter table public.item_episodes add column position integer;
alter table public.episodes
  add column watch_url  text check (watch_url is null or watch_url ~* '^https?://\S+$'),
  add column listen_url text check (listen_url is null or listen_url ~* '^https?://\S+$'),
  add column show_notes text check (show_notes is null or length(show_notes) <= 20000);
grant update (watch_url, listen_url, show_notes) on public.episodes to authenticated;
grant update (position) on public.item_episodes to authenticated;
create policy "members order items" on public.item_episodes for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));

-- item_cards / this_week pick up the new column (views are rebuilt because "i.*" is fixed at creation).
drop view public.this_week;
drop view public.item_cards;
create view public.item_cards
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
create view public.this_week
with (security_invoker = true)
as
select * from public.item_cards where status = 'this_week';
grant select on public.item_cards, public.this_week to authenticated;

-- Inserts made while a Grok reply is being applied are marked as Grok's picks / Grok's memories.
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
  if current_setting('trueadam.via_grok', true) = 'on' then
    new.grok_pick := true;
  end if;
  return new;
end;
$$;

create or replace function public.memories_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.source := case when current_setting('trueadam.via_grok', true) = 'on' then 'grok'
                       when public.my_role() = 'producer' then 'producer' else 'member' end;
  end if;
  new.content := btrim(new.content);
  return new;
end;
$$;

/** When an episode is recorded or published, what was attached to it has aired. */
create function public.episodes_after_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('recorded', 'published') and old.status = 'planning' then
    update public.items i set status = 'used'
     where i.status in ('inbox', 'this_week')
       and exists (select 1 from public.item_episodes ie where ie.item_id = i.id and ie.episode_id = new.id);
  end if;
  return null;
end;
$$;
create trigger episodes_after_status after update of status on public.episodes
  for each row execute function public.episodes_after_status();
revoke execute on function public.episodes_after_status() from public, anon, authenticated;

/** Running order for an episode's show sheet: items in the order given. */
create function public.set_running_order(episode uuid, items uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.item_episodes ie set position = o.n
    from unnest(set_running_order.items) with ordinality as o(item_id, n)
   where ie.episode_id = set_running_order.episode and ie.item_id = o.item_id
$$;

create function public.jsonb_text_array(j jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(j) = 'array'
              then array(select btrim(x) from jsonb_array_elements_text(j) x where nullif(btrim(x), '') is not null)
              when jsonb_typeof(j) = 'string' and nullif(btrim(j #>> '{}'), '') is not null then array[btrim(j #>> '{}')]
              else '{}'::text[] end
$$;

/** An item by id, by link, or by exact title. */
create function public.resolve_item(ref text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select i.id from public.items i
      where i.id = case when resolve_item.ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        then resolve_item.ref::uuid end),
    (select i.id from public.items i
      where resolve_item.ref ~* '^https?://' and i.url_key = public.normalize_url(resolve_item.ref) limit 1),
    (select i.id from public.items i
      where lower(i.title) = lower(btrim(resolve_item.ref)) order by i.created_at desc limit 1))
$$;

/** Everything Grok needs for a session, in one call. `episode` defaults to the next one being planned. */
create function public.grok_brief(episode uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with ep as (
    select e.* from public.episodes e
     where case when grok_brief.episode is not null then e.id = grok_brief.episode
                else e.status = 'planning' and (e.recording_date is null or e.recording_date >= current_date) end
     order by e.recording_date nulls last, e.created_at
     limit 1
  ), ep_items as (
    select c.*, ie.position
    from public.item_cards c
    join public.item_episodes ie on ie.item_id = c.id
    join ep on ep.id = ie.episode_id
  ), digest as (
    select public.producer_digest() as d
  ), brief as (
    select public.show_briefing() as b
  )
  select jsonb_build_object(
    'today', current_date,
    'crew', (select jsonb_agg(jsonb_build_object('name', p.display_name, 'role', p.role) order by p.display_name)
               from public.profiles p),
    'episode', (select jsonb_build_object(
        'id', ep.id, 'title', ep.title, 'recording_date', ep.recording_date, 'status', ep.status, 'notes', ep.notes,
        'quote', (select jsonb_build_object('text', q.text, 'author', q.author, 'role', ep.quote_role)
                    from public.quotes q where q.id = ep.quote_id),
        'items', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'id', i.id, 'title', i.title, 'type', i.item_type, 'summary', left(i.summary, 300),
                     'talking_points', to_jsonb(i.talking_points), 'url', i.url,
                     'stars', nullif(i.highlight_count, 0), 'comments', nullif(i.comment_count, 0)))
                     order by i.position nulls last, i.created_at) from ep_items i), '[]'::jsonb),
        'still_needs', to_jsonb(array_remove(array[
            case when (select count(*) from ep_items i where i.item_type not in ('fun_fact', 'guest_idea')) < 3
                 then 'discussion items (has ' || (select count(*) from ep_items i where i.item_type not in ('fun_fact', 'guest_idea')) || ', wants 3 or more)' end,
            case when not exists (select 1 from ep_items i where i.item_type = 'fun_fact') then 'a fun fact' end,
            case when not exists (select 1 from ep_items i where i.item_type = 'guest_idea') then 'a guest idea' end,
            case when ep.quote_id is null then 'a quote of the show' end,
            case when ep.recording_date is null then 'a recording date' end], null)))
      from ep),
    'nominated_not_attached', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'type', c.item_type)
                                          order by c.created_at desc)
        from public.item_cards c
       where c.status = 'this_week' and not exists (select 1 from ep_items i where i.id = c.id)), '[]'::jsonb),
    'inbox', coalesce((select jsonb_agg(x.j) from (
        select jsonb_strip_nulls(jsonb_build_object('id', c.id, 'title', c.title, 'type', c.item_type,
                 'stars', nullif(c.highlight_count, 0), 'added_by', c.added_by_name)) as j
        from public.item_cards c where c.status = 'inbox' order by c.highlight_count desc, c.created_at desc limit 20) x), '[]'::jsonb),
    'research', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                    'id', r.id, 'kind', r.kind, 'request', r.request, 'asked_by', r.requested_by_name,
                    'about', r.item_title, 'url', r.item_url)) order by r.created_at)
                 from public.research_queue r), '[]'::jsonb),
    'availability', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                    'day', a.day, 'free', to_jsonb(a.free), 'maybe', to_jsonb(a.maybe), 'busy', to_jsonb(a.busy),
                    'everyone_free', case when a.everyone_free then true end,
                    'recording', nullif(to_jsonb(a.episodes), '[]'::jsonb))) order by a.day)
                 from public.crew_availability(current_date, 28) a
                where a.free <> '{}' or a.maybe <> '{}' or a.busy <> '{}' or a.episodes <> '{}'), '[]'::jsonb),
    'news', (select d -> 'topics' from digest),
    'hosts', (select d -> 'hosts' from digest),
    'covered_recently', (select d -> 'covered' from digest),
    'house_rules', (select b -> 'instructions' from brief),
    'pinned', (select b -> 'pinned' from brief))
$$;

/**
 * Save Grok's structured reply. Keys (all optional): items[], research[], reads[], memories[], quote{},
 * nominate[], attach[], show_notes. Returns {episode_id, saved, failed, results[]}.
 */
create function public.apply_grok_reply(reply jsonb, episode uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ep        uuid;
  el        jsonb;
  ref       text;
  new_id    uuid;
  about_id  uuid;
  det       text;
  notes_txt text;
  results   jsonb := '[]'::jsonb;
  uuid_re   constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if auth.uid() is not null and not (select public.is_member()) then
    raise exception 'Only crew members can apply Grok''s reply' using errcode = '42501';
  end if;
  if reply is null or jsonb_typeof(reply) <> 'object' then
    raise exception 'The reply must be one JSON object (see the reply format at the end of the brief).' using errcode = '22023';
  end if;
  if length(reply::text) > 200000 then
    raise exception 'The reply is too large.' using errcode = '22023';
  end if;

  select e.id into ep from public.episodes e
   where case when apply_grok_reply.episode is not null then e.id = apply_grok_reply.episode
              when coalesce(reply ->> 'episode_id', '') ~* uuid_re then e.id = (reply ->> 'episode_id')::uuid
              else e.status = 'planning' and (e.recording_date is null or e.recording_date >= current_date) end
   order by e.recording_date nulls last, e.created_at
   limit 1;

  perform set_config('trueadam.via_grok', 'on', true);

  -- Picks for the prep room
  for el in select t.value from jsonb_array_elements(case when jsonb_typeof(reply -> 'items') = 'array' then reply -> 'items' else '[]'::jsonb end)
              with ordinality as t(value, n) where t.n <= 25
  loop
    begin
      new_id := public.add_item(
        title => el ->> 'title',
        url => nullif(btrim(el ->> 'url'), ''),
        source => el ->> 'source',
        published_at => case when el ->> 'published_at' ~ '^\d{4}-\d{2}-\d{2}' then left(el ->> 'published_at', 10)::date end,
        summary => el ->> 'summary',
        talking_points => public.jsonb_text_array(el -> 'talking_points'),
        quote => el ->> 'quote',
        item_type => coalesce(nullif(el ->> 'type', ''), 'article')::public.item_type,
        status => case when el ->> 'status' = 'this_week' then 'this_week' else 'inbox' end::public.item_status,
        topics => public.jsonb_text_array(el -> 'topics'),
        guest_name => el ->> 'guest_name',
        why_them => el ->> 'why_them');
      if coalesce((el ->> 'attach')::boolean, false) and ep is not null then
        insert into public.item_episodes (item_id, episode_id) values (new_id, ep) on conflict do nothing;
      end if;
      results := results || jsonb_build_object('kind', 'item', 'ok', true, 'label', el ->> 'title', 'id', new_id);
    exception
      when unique_violation then
        get stacked diagnostics det = pg_exception_detail;
        if det ~* uuid_re then
          new_id := det::uuid;
          if el ->> 'status' = 'this_week' then
            update public.items i set status = 'this_week' where i.id = new_id and i.status = 'inbox';
          end if;
          if coalesce((el ->> 'attach')::boolean, false) and ep is not null then
            insert into public.item_episodes (item_id, episode_id) values (new_id, ep) on conflict do nothing;
          end if;
          results := results || jsonb_build_object('kind', 'item', 'ok', true, 'label', el ->> 'title', 'id', new_id,
                                                   'note', 'Already in the prep room; kept the existing item.');
        else
          results := results || jsonb_build_object('kind', 'item', 'ok', false, 'label', el ->> 'title', 'error', sqlerrm);
        end if;
      when others then
        results := results || jsonb_build_object('kind', 'item', 'ok', false, 'label', el ->> 'title', 'error', sqlerrm);
    end;
  end loop;

  -- Research answers
  for el in select t.value from jsonb_array_elements(case when jsonb_typeof(reply -> 'research') = 'array' then reply -> 'research' else '[]'::jsonb end)
              with ordinality as t(value, n) where t.n <= 25
  loop
    begin
      perform public.answer_research((el ->> 'id')::uuid, el ->> 'answer', public.jsonb_text_array(el -> 'sources'), 'Grok');
      results := results || jsonb_build_object('kind', 'research', 'ok', true, 'label', left(el ->> 'answer', 80), 'id', el ->> 'id');
    exception when others then
      results := results || jsonb_build_object('kind', 'research', 'ok', false, 'label', left(coalesce(el ->> 'answer', el ->> 'id'), 80), 'error', sqlerrm);
    end;
  end loop;

  -- Verified reads
  for el in select t.value from jsonb_array_elements(case when jsonb_typeof(reply -> 'reads') = 'array' then reply -> 'reads' else '[]'::jsonb end)
              with ordinality as t(value, n) where t.n <= 25
  loop
    begin
      perform public.save_read(el ->> 'url', el ->> 'summary', public.jsonb_text_array(el -> 'key_points'),
                               public.jsonb_text_array(el -> 'sources'), el ->> 'verdict', el ->> 'title');
      results := results || jsonb_build_object('kind', 'read', 'ok', true, 'label', coalesce(el ->> 'title', el ->> 'url'));
    exception when others then
      results := results || jsonb_build_object('kind', 'read', 'ok', false, 'label', coalesce(el ->> 'title', el ->> 'url'), 'error', sqlerrm);
    end;
  end loop;

  -- Memories
  for el in select t.value from jsonb_array_elements(case when jsonb_typeof(reply -> 'memories') = 'array' then reply -> 'memories' else '[]'::jsonb end)
              with ordinality as t(value, n) where t.n <= 25
  loop
    begin
      about_id := (select p.id from public.profiles p where lower(p.display_name) = lower(btrim(el ->> 'about')) limit 1);
      new_id := public.remember(
        content => el ->> 'content',
        kind => coalesce(nullif(el ->> 'kind', ''), 'fact')::public.memory_kind,
        about_member => about_id,
        about_topic => nullif(btrim(el ->> 'topic'), ''),
        about_entity => case when about_id is null then nullif(btrim(el ->> 'about'), '') end,
        importance => coalesce((el ->> 'importance')::integer, 5),
        pinned => coalesce((el ->> 'pinned')::boolean, false));
      results := results || jsonb_build_object('kind', 'memory', 'ok', true, 'label', left(el ->> 'content', 80), 'id', new_id);
    exception when others then
      results := results || jsonb_build_object('kind', 'memory', 'ok', false, 'label', left(el ->> 'content', 80), 'error', sqlerrm);
    end;
  end loop;

  -- Quote of the show
  if jsonb_typeof(reply -> 'quote') = 'object' then
    el := reply -> 'quote';
    begin
      new_id := public.add_quote(
        quote => el ->> 'text', author => el ->> 'author', source => el ->> 'source', context => el ->> 'context',
        questions => public.jsonb_text_array(el -> 'questions'), topics => public.jsonb_text_array(el -> 'topics'),
        verified => coalesce((el ->> 'verified')::boolean, false), source_url => nullif(btrim(el ->> 'source_url'), ''),
        episode_id => ep, role => nullif(el ->> 'role', '')::public.quote_role);
      results := results || jsonb_build_object('kind', 'quote', 'ok', true, 'label', left(el ->> 'text', 80), 'id', new_id);
    exception
      when unique_violation then
        select q.id into new_id from public.quotes q
         where lower(regexp_replace(q.text, '\W+', '', 'g'))
             = lower(regexp_replace(coalesce(el ->> 'text', ''), '\W+', '', 'g'));
        if new_id is not null and ep is not null then
          update public.episodes e
             set quote_id = new_id,
                 quote_role = case when el ->> 'role' in ('opener', 'closer') then (el ->> 'role')::public.quote_role else e.quote_role end
           where e.id = ep;
          results := results || jsonb_build_object('kind', 'quote', 'ok', true, 'label', left(el ->> 'text', 80), 'id', new_id,
                                                   'note', 'Already in the quote bank; set on the episode.');
        else
          results := results || jsonb_build_object('kind', 'quote', 'ok', false, 'label', left(el ->> 'text', 80), 'error', sqlerrm);
        end if;
      when others then
        results := results || jsonb_build_object('kind', 'quote', 'ok', false, 'label', left(el ->> 'text', 80), 'error', sqlerrm);
    end;
  end if;

  -- Nominate existing items for this week
  for ref in select x from unnest(public.jsonb_text_array(reply -> 'nominate')) x limit 25
  loop
    begin
      new_id := public.resolve_item(ref);
      if new_id is null then
        results := results || jsonb_build_object('kind', 'nominate', 'ok', false, 'label', left(ref, 80), 'error', 'No item with that id, link or title.');
      else
        update public.items i set status = 'this_week' where i.id = new_id and i.status = 'inbox';
        results := results || jsonb_build_object('kind', 'nominate', 'ok', true, 'label', (select i.title from public.items i where i.id = new_id), 'id', new_id);
      end if;
    exception when others then
      results := results || jsonb_build_object('kind', 'nominate', 'ok', false, 'label', left(ref, 80), 'error', sqlerrm);
    end;
  end loop;

  -- Attach existing items to the episode
  for ref in select x from unnest(public.jsonb_text_array(reply -> 'attach')) x limit 25
  loop
    begin
      new_id := public.resolve_item(ref);
      if ep is null then
        results := results || jsonb_build_object('kind', 'attach', 'ok', false, 'label', left(ref, 80), 'error', 'There is no episode to attach to.');
      elsif new_id is null then
        results := results || jsonb_build_object('kind', 'attach', 'ok', false, 'label', left(ref, 80), 'error', 'No item with that id, link or title.');
      else
        insert into public.item_episodes (item_id, episode_id) values (new_id, ep) on conflict do nothing;
        results := results || jsonb_build_object('kind', 'attach', 'ok', true, 'label', (select i.title from public.items i where i.id = new_id), 'id', new_id);
      end if;
    exception when others then
      results := results || jsonb_build_object('kind', 'attach', 'ok', false, 'label', left(ref, 80), 'error', sqlerrm);
    end;
  end loop;

  -- Show notes for the episode
  if reply ? 'show_notes' then
    notes_txt := case when jsonb_typeof(reply -> 'show_notes') = 'string' then reply ->> 'show_notes'
                  when jsonb_typeof(reply -> 'show_notes') = 'object'
                  then concat_ws(E'\n\n', nullif(reply -> 'show_notes' ->> 'description', ''), nullif(reply -> 'show_notes' ->> 'notes', ''),
                         case when jsonb_typeof(reply -> 'show_notes' -> 'clips') = 'array'
                              then 'Clip ideas:' || E'\n- ' || array_to_string(public.jsonb_text_array(reply -> 'show_notes' -> 'clips'), E'\n- ') end)
             end;
    begin
      if ep is null then
        results := results || jsonb_build_object('kind', 'show_notes', 'ok', false, 'label', 'Show notes', 'error', 'There is no episode to save them on.');
      elsif nullif(btrim(notes_txt), '') is null then
        results := results || jsonb_build_object('kind', 'show_notes', 'ok', false, 'label', 'Show notes', 'error', 'The show notes were empty.');
      else
        update public.episodes e set show_notes = left(btrim(notes_txt), 20000) where e.id = ep;
        results := results || jsonb_build_object('kind', 'show_notes', 'ok', true, 'label', 'Show notes', 'id', ep);
      end if;
    exception when others then
      results := results || jsonb_build_object('kind', 'show_notes', 'ok', false, 'label', 'Show notes', 'error', sqlerrm);
    end;
  end if;

  perform set_config('trueadam.via_grok', 'off', true);
  return jsonb_build_object(
    'episode_id', ep,
    'saved', (select count(*) from jsonb_array_elements(results) r where (r ->> 'ok')::boolean),
    'failed', (select count(*) from jsonb_array_elements(results) r where not (r ->> 'ok')::boolean),
    'results', results);
end;
$$;

/** Has this been in the prep room, on air, or in the news before? Up to 3 items and 3 news stories. */
create function public.covered_before(title text, url text default null, exclude uuid default null)
returns table (kind text, id uuid, title text, detail text, seen date, similarity real, link text)
language sql
stable
security invoker
set search_path = ''
as $$
  with k as (
    select public.story_key(covered_before.title) as key,
           public.normalize_url(nullif(btrim(covered_before.url), '')) as ukey
  ), its as (
    select i.id, i.title, i.status, i.created_at, i.url,
           greatest(case when length(k.key) > 8 then extensions.similarity(public.story_key(i.title), k.key) else 0 end,
                    case when i.url_key is not null and i.url_key = k.ukey then 1 else 0 end)::real as sim,
           (select array_agg(e.title order by e.recording_date desc nulls last)
              from public.item_episodes ie join public.episodes e on e.id = ie.episode_id
             where ie.item_id = i.id and e.status <> 'planning') as aired_in,
           (select max(e.recording_date)
              from public.item_episodes ie join public.episodes e on e.id = ie.episode_id
             where ie.item_id = i.id and e.status <> 'planning') as aired_on
    from public.items i, k
    where i.id is distinct from covered_before.exclude
  ), news as (
    select c.story_id, (array_agg(c.title order by c.seen))[1] as title, min(c.seen)::date as first_seen,
           max(c.sim)::real as sim, count(distinct c.feed_id) as outlets, (array_agg(c.url order by c.seen))[1] as url
    from (
      select e.story_id, e.title, e.url, e.feed_id, coalesce(e.published_at, e.created_at) as seen,
             extensions.similarity(e.title_key, k.key) as sim
      from public.feed_entries e, k
      where length(k.key) > 12
      order by e.title_key operator(extensions.<->) k.key
      limit 30
    ) c
    where c.sim >= 0.45
    group by c.story_id
  )
  (select case when its.status = 'used' or its.aired_in is not null then 'aired' else 'prep' end,
          its.id, its.title,
          case when its.aired_in is not null then 'Covered in ' || array_to_string(its.aired_in[1:2], ', ')
               when its.status = 'used' then 'Already used on the show'
               when its.status = 'this_week' then 'Already nominated for this week'
               when its.status = 'archived' then 'Archived earlier'
               else 'Already in the inbox' end,
          coalesce(its.aired_on, its.created_at::date), its.sim, its.url
     from its where its.sim >= 0.45
    order by its.sim desc limit 3)
  union all
  (select 'news', news.story_id, news.title,
          'In the news since ' || to_char(news.first_seen, 'FMMon FMDD') || ' · ' || news.outlets
            || case when news.outlets = 1 then ' source' else ' sources' end,
          news.first_seen, news.sim, news.url
     from news order by news.sim desc limit 3)
$$;

revoke execute on function public.set_running_order(uuid, uuid[]), public.resolve_item(text), public.grok_brief(uuid),
  public.apply_grok_reply(jsonb, uuid), public.covered_before(text, text, uuid) from public, anon;
grant execute on function public.set_running_order(uuid, uuid[]), public.resolve_item(text), public.grok_brief(uuid),
  public.apply_grok_reply(jsonb, uuid), public.covered_before(text, text, uuid) to authenticated;
