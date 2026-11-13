-- Listener mailbag, @mentions, an in-app inbox, nudges and push subscriptions.
--
-- 1. listener_questions + submit_question(): the public "Ask the show" form. No sign-in; no table access
--    for the public; honeypot, length and link checks, and rate limits. Crew turn a question into a
--    prep-room item with question_to_item().
-- 2. notifications: each member's inbox. Filled by @mentions in comments, by Grok answering your research
--    question, by the weekly nudge, and by "send me a test".
-- 3. crew_nudge(): what the next episode still needs, worded for one member or for the group chat.
--    create_weekly_nudges() runs on Wednesdays (pg_cron) and on demand for the producer.
-- 4. push_subscriptions + push_outbox()/push_result(): phones that asked for notifications. A small
--    sender (Edge Function) reads the outbox with a shared secret; nothing is sent until it is set up.

-- ---------------------------------------------------------------------------
-- Mailbag
-- ---------------------------------------------------------------------------
create type public.question_status as enum ('new', 'saved', 'dismissed');

create table public.listener_questions (
  id          uuid primary key default gen_random_uuid(),
  name        text check (name is null or length(name) <= 80),
  location    text check (location is null or length(location) <= 80),
  question    text not null check (length(btrim(question)) between 5 and 800),
  status      public.question_status not null default 'new',
  item_id     uuid references public.items (id) on delete set null,
  sender_hash text,              -- rate limiting only; cleared after a day
  created_at  timestamptz not null default now()
);
create index listener_questions_created_idx on public.listener_questions (created_at desc);
create index listener_questions_item_idx on public.listener_questions (item_id);

alter table public.listener_questions enable row level security;
create policy "members read questions" on public.listener_questions for select to authenticated using ((select public.is_member()));
create policy "members sort questions" on public.listener_questions for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy "producer removes questions" on public.listener_questions for delete to authenticated
  using ((select public.my_role()) = 'producer');
revoke all on public.listener_questions from anon, authenticated;
grant select (id, name, location, question, status, item_id, created_at), delete on public.listener_questions to authenticated;
grant update (status, item_id) on public.listener_questions to authenticated;

/** Public: send a question to the show. Returns true when accepted. */
create function public.submit_question(question text, name text default null, location text default null,
                                       website text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  q       text := btrim(regexp_replace(coalesce(submit_question.question, ''), '\s+', ' ', 'g'));
  hdr     json;
  ip      text;
  sender  text;
begin
  if nullif(btrim(coalesce(submit_question.website, '')), '') is not null then
    return true;                       -- honeypot field filled in: a bot. Pretend it worked.
  end if;
  if length(q) < 5 or length(q) > 800 then
    raise exception 'Please write a question between 5 and 800 characters.' using errcode = '22023';
  end if;
  if q ~* '(https?://|www\.)' then
    raise exception 'Please leave links out of your question.' using errcode = '22023';
  end if;

  begin
    hdr := nullif(current_setting('request.headers', true), '')::json;
    ip := coalesce(nullif(hdr ->> 'cf-connecting-ip', ''), nullif(btrim(split_part(hdr ->> 'x-forwarded-for', ',', 1)), ''));
  exception when others then
    ip := null;
  end;
  if ip is not null then
    sender := encode(extensions.digest(ip || '|' || current_date::text, 'sha256'), 'hex');
  end if;

  update public.listener_questions lq set sender_hash = null
   where lq.sender_hash is not null and lq.created_at < now() - interval '1 day';

  if sender is not null and (select count(*) from public.listener_questions lq
                              where lq.sender_hash = sender and lq.created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Thanks! You''ve sent a few already. Please try again later.' using errcode = '53400';
  end if;
  if (select count(*) from public.listener_questions lq where lq.created_at > now() - interval '1 hour') >= 40
     or (select count(*) from public.listener_questions lq where lq.created_at > now() - interval '1 day') >= 200 then
    raise exception 'The mailbag is full right now. Please try again tomorrow.' using errcode = '53400';
  end if;
  if exists (select 1 from public.listener_questions lq
              where lower(lq.question) = lower(q) and lq.created_at > now() - interval '7 days') then
    return true;                       -- same question again: already have it
  end if;

  insert into public.listener_questions (name, location, question, sender_hash)
  values (nullif(left(btrim(regexp_replace(coalesce(submit_question.name, ''), '\s+', ' ', 'g')), 80), ''),
          nullif(left(btrim(regexp_replace(coalesce(submit_question.location, ''), '\s+', ' ', 'g')), 80), ''),
          q, sender);
  return true;
end;
$$;
revoke execute on function public.submit_question(text, text, text, text) from public;
grant execute on function public.submit_question(text, text, text, text) to anon, authenticated;

/** Crew: turn a listener question into a prep-room item (a note in the inbox). Returns the item id. */
create function public.question_to_item(question_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lq      record;     -- crew can't read every column (the rate-limit hash is hidden), so name them
  new_id  uuid;
begin
  select x.id, x.name, x.location, x.question, x.item_id into lq
    from public.listener_questions x where x.id = question_to_item.question_id;
  if not found then
    raise exception 'No listener question with id %', question_to_item.question_id using errcode = 'no_data_found';
  end if;
  if lq.item_id is not null then
    return lq.item_id;
  end if;
  new_id := public.add_item(
    title => 'Listener question: ' || case when length(lq.question) > 90 then left(lq.question, 88) || '…' else lq.question end,
    summary => lq.question,
    source => 'Listener' || coalesce(': ' || nullif(concat_ws(', ', lq.name, lq.location), ''), ''),
    item_type => 'note');
  update public.listener_questions x set status = 'saved', item_id = new_id where x.id = lq.id;
  return new_id;
end;
$$;
revoke execute on function public.question_to_item(uuid) from public, anon;
grant execute on function public.question_to_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications (each member's inbox)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('mention', 'answer', 'nudge', 'test')),
  title      text not null check (length(title) <= 200),
  body       text check (body is null or length(body) <= 1000),
  url        text check (url is null or url ~ '^#/'),
  actor_id   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  pushed_at  timestamptz,
  push_error text
);
create index notifications_member_idx on public.notifications (member_id, created_at desc);
create index notifications_actor_idx on public.notifications (actor_id);

alter table public.notifications enable row level security;
create policy "read own notifications" on public.notifications for select to authenticated using (member_id = (select auth.uid()));
create policy "mark own notifications" on public.notifications for update to authenticated
  using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));
create policy "clear own notifications" on public.notifications for delete to authenticated using (member_id = (select auth.uid()));
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

/** @Name (or @all / @crew / @everyone) in a comment puts a note in that member's inbox. */
create function public.comments_notify_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text := coalesce((select p.display_name from public.profiles p where p.id = new.author_id), 'The producer');
  item_title text := (select i.title from public.items i where i.id = new.item_id);
begin
  insert into public.notifications (member_id, kind, title, body, url, actor_id)
  select p.id, 'mention', actor || ' mentioned you',
         left('“' || left(new.body, 240) || '” · on ' || coalesce(item_title, 'an item'), 1000),
         '#/i/' || new.item_id, new.author_id
  from public.profiles p
  where p.id is distinct from new.author_id
    and (new.body ~* '(^|[^[:alnum:]_])@(all|crew|everyone)($|[^[:alnum:]_])'
         or new.body ~* ('(^|[^[:alnum:]_])@' || regexp_replace(p.display_name, '([][\\.^$*+?(){}|-])', '\\\1', 'g') || '($|[^[:alnum:]_])')
         or new.body ~* ('(^|[^[:alnum:]_])@' || regexp_replace(split_part(p.display_name, ' ', 1), '([][\\.^$*+?(){}|-])', '\\\1', 'g') || '($|[^[:alnum:]_])'));
  return null;
end;
$$;
create trigger comments_notify_mentions after insert on public.comments
  for each row execute function public.comments_notify_mentions();

/** When a research request is answered by someone else, tell the person who asked. */
create function public.research_notify_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'done' and old.status is distinct from 'done'
     and new.requested_by is not null and new.requested_by is distinct from auth.uid() then
    insert into public.notifications (member_id, kind, title, body, url)
    values (new.requested_by, 'answer', coalesce(nullif(new.answered_by, ''), 'Grok') || ' answered your question',
            left(new.request, 300), '#/research');
  end if;
  return null;
end;
$$;
create trigger research_notify_answer after update of status on public.research_requests
  for each row execute function public.research_notify_answer();

-- ---------------------------------------------------------------------------
-- Nudges
-- ---------------------------------------------------------------------------
/** What the next episode still needs. `member` = worded for that person; null = for the group chat. */
create function public.crew_nudge(member uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  ep        public.episodes;
  n_talk    integer;
  n_all     integer;
  needs     text[];
  lines     text[] := '{}';
  waiting   text[];
  days_left integer;
begin
  select e.* into ep from public.episodes e
   where e.status = 'planning' and (e.recording_date is null or e.recording_date >= current_date)
   order by e.recording_date nulls last, e.created_at
   limit 1;

  if ep.id is null then
    lines := lines || 'No episode is being planned yet. Pick a date on the Episodes calendar.'::text;
  else
    select count(*) filter (where i.item_type not in ('fun_fact', 'guest_idea')), count(*)
      into n_talk, n_all
      from public.item_episodes ie join public.items i on i.id = ie.item_id
     where ie.episode_id = ep.id;
    days_left := ep.recording_date - current_date;
    lines := lines || (ep.title || case
        when ep.recording_date is null then ' has no recording date yet.'
        when days_left = 0 then ' records today.'
        when days_left = 1 then ' records tomorrow.'
        else ' records ' || to_char(ep.recording_date, 'FMDay, FMMon FMDD') || ' (in ' || days_left || ' days).' end);
    needs := array_remove(array[
      case when n_talk < 3 then (3 - n_talk) || ' more discussion ' || case when 3 - n_talk = 1 then 'item' else 'items' end end,
      case when not exists (select 1 from public.item_episodes ie join public.items i on i.id = ie.item_id
                             where ie.episode_id = ep.id and i.item_type = 'fun_fact') then 'a fun fact' end,
      case when not exists (select 1 from public.item_episodes ie join public.items i on i.id = ie.item_id
                             where ie.episode_id = ep.id and i.item_type = 'guest_idea') then 'a guest idea' end,
      case when ep.quote_id is null then 'a quote' end], null);
    lines := lines || case when coalesce(array_length(needs, 1), 0) = 0
                           then 'It has everything it needs (' || n_all || ' items attached).'
                           else 'It still needs ' || array_to_string(needs, ', ') || '.' end;
  end if;

  if crew_nudge.member is not null then
    if not exists (select 1 from public.availability a
                    where a.member_id = crew_nudge.member and a.day between current_date and current_date + 13) then
      lines := lines || 'You haven''t marked which days you''re free in the next two weeks.'::text;
    end if;
  else
    select array_agg(p.display_name order by p.display_name) into waiting
      from public.profiles p
     where not exists (select 1 from public.availability a
                        where a.member_id = p.id and a.day between current_date and current_date + 13);
    if waiting is not null then
      lines := lines || ('Still to mark their free days: ' || array_to_string(waiting, ', ') || '.');
    end if;
  end if;

  lines := lines || ((select count(*) from public.items i where i.status = 'inbox') || ' in the inbox, '
                     || (select count(*) from public.items i where i.status = 'this_week')
                     || ' nominated. Star what you want to talk about.');

  return jsonb_build_object(
    'title', 'This week on True Adam',
    'body', array_to_string(lines, ' '),
    'lines', to_jsonb(lines),
    'url', case when ep.id is not null then '#/e/' || ep.id else '#/episodes' end);
end;
$$;
revoke execute on function public.crew_nudge(uuid) from public, anon;
grant execute on function public.crew_nudge(uuid) to authenticated;

/** Put this week's nudge in every member's inbox (and on their phone if they turned notifications on). */
create function public.create_weekly_nudges(force boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  p  record;
  n  jsonb;
  made integer := 0;
begin
  if auth.uid() is not null and (select public.my_role())::text is distinct from 'producer' then
    raise exception 'Only the producer can send nudges' using errcode = '42501';
  end if;
  for p in select pr.id from public.profiles pr loop
    continue when not create_weekly_nudges.force and exists (
      select 1 from public.notifications x
       where x.member_id = p.id and x.kind = 'nudge' and x.created_at > now() - interval '5 days');
    n := public.crew_nudge(p.id);
    insert into public.notifications (member_id, kind, title, body, url)
    values (p.id, 'nudge', n ->> 'title', left(n ->> 'body', 1000), n ->> 'url');
    made := made + 1;
  end loop;
  return made;
end;
$$;
revoke execute on function public.create_weekly_nudges(boolean) from public, anon;
grant execute on function public.create_weekly_nudges(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Push notifications
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique check (endpoint ~ '^https://\S+$' and length(endpoint) <= 2000),
  p256dh     text not null check (length(p256dh) between 20 and 200),
  auth_key   text not null check (length(auth_key) between 8 and 100),
  device     text check (device is null or length(device) <= 200),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failures   integer not null default 0
);
create index push_subscriptions_member_idx on public.push_subscriptions (member_id);
alter table public.push_subscriptions enable row level security;
create policy "read own push subscriptions" on public.push_subscriptions for select to authenticated using (member_id = (select auth.uid()));
create policy "remove own push subscriptions" on public.push_subscriptions for delete to authenticated using (member_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon, authenticated;
grant select (id, member_id, endpoint, device, created_at, last_ok_at, failures), delete on public.push_subscriptions to authenticated;

-- Sender settings: no access from the site at all (RLS on, no policies, no grants).
create table public.push_config (
  id            boolean primary key default true check (id),
  vapid_public  text,
  sender_url    text check (sender_url is null or sender_url ~ '^https://\S+$'),
  sender_secret text
);
insert into public.push_config (id) values (true);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

/** The public key phones subscribe with; null until push is set up. */
create function public.push_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.vapid_public from public.push_config c where (select public.is_member()) and c.sender_url is not null
$$;

/** Remember this phone for notifications (moves the phone to whoever is signed in on it). */
create function public.save_push_subscription(endpoint text, p256dh text, auth_key text, device text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select public.is_member()) then
    raise exception 'Only crew members can turn on notifications' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (member_id, endpoint, p256dh, auth_key, device)
  values (auth.uid(), save_push_subscription.endpoint, save_push_subscription.p256dh, save_push_subscription.auth_key,
          left(save_push_subscription.device, 200))
  on conflict on constraint push_subscriptions_endpoint_key do update
    set member_id = excluded.member_id, p256dh = excluded.p256dh, auth_key = excluded.auth_key,
        device = excluded.device, failures = 0;
end;
$$;

/** A test notification for the signed-in member. */
create function public.send_test_notification()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select public.is_member()) then
    raise exception 'Only crew members can do this' using errcode = '42501';
  end if;
  insert into public.notifications (member_id, kind, title, body, url)
  values (auth.uid(), 'test', 'True Adam', 'Notifications are working on this device.', '#/inbox');
end;
$$;

revoke execute on function public.push_public_key(), public.save_push_subscription(text, text, text, text),
  public.send_test_notification() from public, anon;
grant execute on function public.push_public_key(), public.save_push_subscription(text, text, text, text),
  public.send_test_notification() to authenticated;

/** Sender only (shared secret): notifications waiting to go to subscribed phones. */
create function public.push_outbox(secret text, only_id uuid default null)
returns table (notification_id uuid, subscription_id uuid, title text, body text, url text, kind text,
               endpoint text, p256dh text, auth_key text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(push_outbox.secret, '') is null
     or not exists (select 1 from public.push_config c where c.sender_secret = push_outbox.secret) then
    raise exception 'Invalid push secret' using errcode = '28000';
  end if;
  return query
    select n.id, s.id, n.title, n.body, n.url, n.kind, s.endpoint, s.p256dh, s.auth_key
    from public.notifications n
    join public.push_subscriptions s on s.member_id = n.member_id
    where n.pushed_at is null and n.created_at > now() - interval '2 days'
      and (push_outbox.only_id is null or n.id = push_outbox.only_id)
    order by n.created_at
    limit 200;
end;
$$;

/** Sender only: record what happened. results = [{notification_id, subscription_id, status, error}] */
create function public.push_result(secret text, results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  n integer := 0;
  st integer;
begin
  if nullif(push_result.secret, '') is null
     or not exists (select 1 from public.push_config c where c.sender_secret = push_result.secret) then
    raise exception 'Invalid push secret' using errcode = '28000';
  end if;
  for r in select t.value from jsonb_array_elements(case when jsonb_typeof(push_result.results) = 'array' then push_result.results else '[]'::jsonb end)
             with ordinality as t(value, i) where t.i <= 500
  loop
    st := nullif(r ->> 'status', '')::integer;
    if st between 200 and 299 then
      update public.notifications x set pushed_at = now(), push_error = null where x.id = (r ->> 'notification_id')::uuid;
      update public.push_subscriptions s set last_ok_at = now(), failures = 0 where s.id = (r ->> 'subscription_id')::uuid;
      n := n + 1;
    elsif st in (404, 410) then
      delete from public.push_subscriptions s where s.id = (r ->> 'subscription_id')::uuid;   -- the phone unsubscribed
    else
      update public.notifications x set push_error = left(coalesce(r ->> 'error', 'HTTP ' || coalesce(st::text, '?')), 300)
       where x.id = (r ->> 'notification_id')::uuid and x.pushed_at is null;
      update public.push_subscriptions s set failures = s.failures + 1 where s.id = (r ->> 'subscription_id')::uuid;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public.push_outbox(text, uuid), public.push_result(text, jsonb) from public;
grant execute on function public.push_outbox(text, uuid), public.push_result(text, jsonb) to anon, authenticated;

/** A new notification wakes the sender, if one is set up and the member has a subscribed phone. */
create function public.notifications_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.push_config;
begin
  select * into cfg from public.push_config c limit 1;
  if cfg.sender_url is not null and cfg.sender_secret is not null
     and to_regnamespace('net') is not null
     and exists (select 1 from public.push_subscriptions s where s.member_id = new.member_id) then
    begin
      execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 8000)'
        using cfg.sender_url, jsonb_build_object('notification_id', new.id),
              jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.sender_secret);
    exception when others then
      null;   -- never let a push problem block the comment / answer / nudge itself
    end;
  end if;
  return null;
end;
$$;
create trigger notifications_after_insert after insert on public.notifications
  for each row execute function public.notifications_after_insert();

revoke execute on function public.comments_notify_mentions(), public.research_notify_answer(),
  public.notifications_after_insert() from public, anon, authenticated;

-- Weekly nudge: Wednesdays 23:00 UTC (6pm Eastern / 3pm Pacific).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('weekly-nudge', '0 23 * * 3', 'select public.create_weekly_nudges()');
  end if;
end;
$$;

-- The brief also carries new listener questions.
create or replace function public.grok_brief(episode uuid default null)
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
    'mailbag', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                    'question', q.question, 'from', nullif(concat_ws(', ', q.name, q.location), ''))) order by q.created_at desc)
                 from (select lq.question, lq.name, lq.location, lq.created_at from public.listener_questions lq
                        where lq.status = 'new' order by lq.created_at desc limit 10) q), '[]'::jsonb),
    'house_rules', (select b -> 'instructions' from brief),
    'pinned', (select b -> 'pinned' from brief))
$$;
