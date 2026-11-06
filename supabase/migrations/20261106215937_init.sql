-- True Adam Podcast prep site: initial schema.
-- Apply once to a fresh, dedicated Supabase project (SQL editor, `supabase db push`,
-- or the Supabase connector's apply_migration). Names here are the stable contract
-- the producer writes against; do not rename without updating docs/PRODUCER.md.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.member_role          as enum ('host', 'producer');
create type public.item_type            as enum ('article', 'video', 'note', 'fun_fact', 'guest_idea');
create type public.item_status          as enum ('inbox', 'this_week', 'used', 'archived');
create type public.episode_status       as enum ('planning', 'recorded', 'published');
create type public.guest_contact_status as enum ('not_contacted', 'reached_out', 'confirmed', 'declined');

-- ---------------------------------------------------------------------------
-- URL normalisation (used for duplicate detection)
--   https://www.example.com/a/?utm_source=x#top  ->  example.com/a
--   https://youtu.be/ID?si=abc                   ->  youtube.com/watch?v=ID
-- Scheme, www./m., fragments, trailing slashes and common tracking params are
-- ignored. Path and remaining query keep their case (YouTube ids are case-sensitive).
-- ---------------------------------------------------------------------------
create function public.normalize_url(raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  u     text := btrim(raw);
  m     text[];
  host  text;
  rest  text;
  path  text;
  query text;
  kept  text[];
begin
  if u is null or u = '' then
    return null;
  end if;
  u := regexp_replace(u, '#.*$', '');
  m := regexp_match(u, '^[a-zA-Z][a-zA-Z0-9+.-]*://([^/?]*)(.*)$');
  if m is null then
    return u;
  end if;
  host := regexp_replace(lower(m[1]), '^(www|m)\.', '');
  rest := m[2];
  path := regexp_replace(split_part(rest, '?', 1), '/+$', '');
  query := substr(rest, length(split_part(rest, '?', 1)) + 2);

  select array_agg(p order by p) into kept
  from unnest(string_to_array(query, '&')) as p
  where p <> ''
    and lower(split_part(p, '=', 1)) !~
        '^(utm_.*|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|si|smid|cmpid|ref_src|_ga)$';

  if host = 'youtu.be' and path <> '' then
    kept := array_prepend('v=' || substr(path, 2), coalesce(kept, '{}'));
    host := 'youtube.com';
    path := '/watch';
  end if;

  return host || path || coalesce('?' || array_to_string(kept, '&'), '');
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.topics (
  slug        text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  sort_order  integer not null,
  description text
);

-- Allow-list: only these emails get a profile (and therefore any access).
-- Managed by the producer with SQL; not readable from the website.
create table public.allowed_emails (
  email        text primary key check (email = lower(btrim(email)) and email like '%@%'),
  display_name text not null,
  role         public.member_role not null default 'host',
  created_at   timestamptz not null default now()
);

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role         public.member_role not null default 'host',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.items (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (btrim(title) <> ''),
  url            text check (url ~* '^https?://\S+$'),
  url_key        text generated always as (public.normalize_url(url)) stored,
  source         text,
  published_at   date,
  summary        text,
  talking_points text[] not null default '{}',
  quote          text,
  item_type      public.item_type not null default 'article',
  status         public.item_status not null default 'inbox',
  guest_name     text,
  why_them       text,
  contact_status public.guest_contact_status,
  added_by       uuid references public.profiles (id) on delete set null,
  added_by_role  public.member_role not null default 'producer',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint items_url_unique unique (url_key)
);
comment on column public.items.url_key is
  'Normalised URL used for duplicate detection. Generated; never insert it.';
comment on column public.items.talking_points is
  'Questions / angles for the mics, one per array element.';

create table public.item_topics (
  item_id    uuid not null references public.items (id) on delete cascade,
  topic_slug text not null references public.topics (slug) on update cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, topic_slug)
);

create table public.episodes (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (btrim(title) <> ''),
  recording_date date,
  status         public.episode_status not null default 'planning',
  notes          text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.item_episodes (
  item_id    uuid not null references public.items (id) on delete cascade,
  episode_id uuid not null references public.episodes (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (item_id, episode_id)
);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  author_role public.member_role not null default 'producer',
  body        text not null check (btrim(body) <> ''),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index items_status_created_idx   on public.items (status, created_at desc);
create index items_added_by_idx         on public.items (added_by);
create index item_topics_topic_idx      on public.item_topics (topic_slug);
create index item_episodes_episode_idx  on public.item_episodes (episode_id);
create index item_episodes_added_by_idx on public.item_episodes (added_by);
create index comments_item_idx          on public.comments (item_id, created_at);
create index comments_author_idx        on public.comments (author_id);
create index episodes_created_by_idx    on public.episodes (created_by);

-- ---------------------------------------------------------------------------
-- Seed topics (stable slugs)
-- ---------------------------------------------------------------------------
insert into public.topics (slug, name, sort_order, description) values
  ('news',             'News',             10,  'Current events.'),
  ('politics',         'Politics',         20,  null),
  ('personal-finance', 'Personal Finance', 30,  'Money, budgeting, providing for a family.'),
  ('economics',        'Economics',        40,  null),
  ('religion',         'Religion',         50,  'Faith, scripture, the Church.'),
  ('philosophy',       'Philosophy',       60,  null),
  ('history',          'History',          70,  null),
  ('working-out',      'Working Out',      80,  'Training, health, discipline.'),
  ('dating-culture',   'Dating Culture',   90,  'Dating, marriage, manhood vs. dirtbag culture.'),
  ('science',          'Science',          100, null),
  ('literature',       'Literature',       110, null),
  ('arts',             'Arts',             120, null),
  ('pop-culture',      'Pop Culture',      130, 'Celebrities, internet culture, TV, trends.'),
  ('music',            'Music',            140, null),
  ('movies',           'Movies',           150, 'Film, including MCU and comic-book movies.'),
  ('guests',           'Guests',           160, 'Guest ideas. guest_idea items are tagged here automatically.'),
  ('fun-facts',        'Fun Facts',        170, 'One per episode. fun_fact items are tagged here automatically.');

-- ---------------------------------------------------------------------------
-- Membership helpers (used by RLS)
-- ---------------------------------------------------------------------------
create function public.my_role()
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;

-- Create / update / remove the profile for one auth user, based on the allow-list.
-- A profile exists only if the user's email is confirmed AND allow-listed.
create function public.sync_profile(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  a record;
begin
  select id, email, email_confirmed_at into u from auth.users where id = uid;
  if found and u.email_confirmed_at is not null then
    select * into a from public.allowed_emails where email = lower(btrim(u.email));
    if found then
      insert into public.profiles (id, display_name, role)
      values (u.id, a.display_name, a.role)
      on conflict (id) do update set role = excluded.role;
      return;
    end if;
  end if;
  delete from public.profiles where id = uid;
end;
$$;

create function public.on_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_profile(new.id);
  return new;
end;
$$;

create trigger on_auth_user_change
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.on_auth_user_change();

create function public.on_allowed_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  for uid in
    select id from auth.users
    where lower(btrim(email)) in (
      case when tg_op <> 'INSERT' then old.email end,
      case when tg_op <> 'DELETE' then new.email end
    )
  loop
    perform public.sync_profile(uid);
  end loop;
  return null;
end;
$$;

create trigger on_allowed_email_change
  after insert or update or delete on public.allowed_emails
  for each row execute function public.on_allowed_email_change();

-- ---------------------------------------------------------------------------
-- Row bookkeeping triggers
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_updated_at    before update on public.items    for each row execute function public.set_updated_at();
create trigger episodes_updated_at before update on public.episodes for each row execute function public.set_updated_at();
create trigger comments_updated_at before update on public.comments for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

-- Website users: added_by / added_by_role always come from the session.
-- Direct SQL / service role (no auth.uid()): added_by_role defaults to 'producer',
-- or to the role of the profile given in added_by.
create function public.items_before_insert()
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
  end if;
  return new;
end;
$$;

create trigger items_before_insert
  before insert on public.items
  for each row execute function public.items_before_insert();

-- Hosts can change anyone's item status / guest contact status, but only the
-- person who added an item (or a producer) can change its written content.
create function public.items_guard_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null
     or old.added_by = auth.uid()
     or public.my_role() = 'producer' then
    return new;
  end if;
  if (new.title, new.url, new.source, new.published_at, new.summary,
      new.talking_points, new.quote, new.item_type, new.guest_name, new.why_them)
     is distinct from
     (old.title, old.url, old.source, old.published_at, old.summary,
      old.talking_points, old.quote, old.item_type, old.guest_name, old.why_them)
  then
    raise exception 'Only the person who added this item (or the producer) can edit its text.'
      using errcode = '42501',
            hint = 'You can still change its status, attach it to an episode, or comment.';
  end if;
  return new;
end;
$$;

create trigger items_guard_content
  before update on public.items
  for each row execute function public.items_guard_content();

-- fun_fact items always show under Fun Facts, guest_idea items under Guests.
create function public.items_auto_topic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.item_type = 'fun_fact' then
    insert into public.item_topics (item_id, topic_slug) values (new.id, 'fun-facts') on conflict do nothing;
  elsif new.item_type = 'guest_idea' then
    insert into public.item_topics (item_id, topic_slug) values (new.id, 'guests') on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger items_auto_topic
  after insert or update of item_type on public.items
  for each row execute function public.items_auto_topic();

create function public.comments_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.author_id := auth.uid();
    new.author_role := coalesce(public.my_role(), 'host');
  elsif new.author_id is not null then
    new.author_role := coalesce(
      (select role from public.profiles where id = new.author_id),
      new.author_role);
  end if;
  return new;
end;
$$;

create trigger comments_before_insert
  before insert on public.comments
  for each row execute function public.comments_before_insert();

create function public.set_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_table_name = 'episodes' then
      new.created_by := auth.uid();
    else
      new.added_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

create trigger episodes_set_creator      before insert on public.episodes      for each row execute function public.set_creator();
create trigger item_episodes_set_creator before insert on public.item_episodes for each row execute function public.set_creator();

-- ---------------------------------------------------------------------------
-- Producer helper: insert an item and its topics in one call, with readable
-- errors for duplicate URLs and unknown topic slugs. Runs with the caller's
-- privileges (RLS applies to website users; SQL / service role bypasses RLS).
-- ---------------------------------------------------------------------------
create function public.add_item(
  title          text,
  url            text default null,
  source         text default null,
  published_at   date default null,
  summary        text default null,
  talking_points text[] default '{}',
  quote          text default null,
  item_type      public.item_type default 'article',
  status         public.item_status default 'inbox',
  topics         text[] default '{}',
  guest_name     text default null,
  why_them       text default null,
  contact_status public.guest_contact_status default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing record;
  unknown  text[];
  new_id   uuid;
begin
  if nullif(btrim(add_item.url), '') is not null then
    select i.id, i.title, i.status into existing
    from public.items i
    where i.url_key = public.normalize_url(add_item.url);
    if found then
      raise exception 'Duplicate URL: already saved as "%" (status: %, id: %).',
        existing.title, existing.status, existing.id
        using errcode = 'unique_violation',
              detail = existing.id::text,
              hint = 'Update the existing item (e.g. its status or topics) instead of adding it again.';
    end if;
  end if;

  select array_agg(t) into unknown
  from unnest(coalesce(add_item.topics, '{}')) as t
  where not exists (select 1 from public.topics tp where tp.slug = t);
  if unknown is not null then
    raise exception 'Unknown topic slug(s): %. Valid slugs: %.',
      array_to_string(unknown, ', '),
      (select string_agg(tp.slug, ', ' order by tp.sort_order) from public.topics tp)
      using errcode = 'foreign_key_violation';
  end if;

  insert into public.items (title, url, source, published_at, summary, talking_points, quote,
                            item_type, status, guest_name, why_them, contact_status)
  values (add_item.title, nullif(btrim(add_item.url), ''), add_item.source, add_item.published_at,
          add_item.summary, coalesce(add_item.talking_points, '{}'), add_item.quote,
          add_item.item_type, add_item.status, add_item.guest_name, add_item.why_them,
          add_item.contact_status)
  returning id into new_id;

  insert into public.item_topics (item_id, topic_slug)
  select new_id, t from unnest(coalesce(add_item.topics, '{}')) as t
  on conflict do nothing;

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Views (security_invoker: callers only see what RLS lets them see)
-- ---------------------------------------------------------------------------
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
  coalesce(p.display_name, initcap(i.added_by_role::text)) as added_by_name
from public.items i
left join public.profiles p on p.id = i.added_by;

create view public.this_week
with (security_invoker = true)
as
select * from public.item_cards where status = 'this_week';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.topics         enable row level security;
alter table public.allowed_emails enable row level security;
alter table public.profiles       enable row level security;
alter table public.items          enable row level security;
alter table public.item_topics    enable row level security;
alter table public.episodes       enable row level security;
alter table public.item_episodes  enable row level security;
alter table public.comments       enable row level security;

-- allowed_emails: no policies -> no website access at all.

create policy "members read topics"   on public.topics   for select to authenticated using ((select public.is_member()));
create policy "members read profiles" on public.profiles for select to authenticated using ((select public.is_member()));
create policy "edit own profile"      on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members read items"   on public.items for select to authenticated using ((select public.is_member()));
create policy "members add items"    on public.items for insert to authenticated with check ((select public.is_member()));
create policy "members update items" on public.items for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy "owner or producer deletes items" on public.items for delete to authenticated
  using ((select public.is_member())
         and (added_by = (select auth.uid()) or (select public.my_role()) = 'producer'));

create policy "members read item topics"   on public.item_topics for select to authenticated using ((select public.is_member()));
create policy "members tag items"          on public.item_topics for insert to authenticated with check ((select public.is_member()));
create policy "members untag items"        on public.item_topics for delete to authenticated using ((select public.is_member()));

create policy "members read episodes"   on public.episodes for select to authenticated using ((select public.is_member()));
create policy "members add episodes"    on public.episodes for insert to authenticated with check ((select public.is_member()));
create policy "members update episodes" on public.episodes for update to authenticated
  using ((select public.is_member())) with check ((select public.is_member()));
create policy "creator or producer deletes episodes" on public.episodes for delete to authenticated
  using ((select public.is_member())
         and (created_by = (select auth.uid()) or (select public.my_role()) = 'producer'));

create policy "members read item episodes" on public.item_episodes for select to authenticated using ((select public.is_member()));
create policy "members attach items"       on public.item_episodes for insert to authenticated with check ((select public.is_member()));
create policy "members detach items"       on public.item_episodes for delete to authenticated using ((select public.is_member()));

create policy "members read comments" on public.comments for select to authenticated using ((select public.is_member()));
create policy "members comment"       on public.comments for insert to authenticated with check ((select public.is_member()));
create policy "edit own comments"     on public.comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "author or producer deletes comments" on public.comments for delete to authenticated
  using ((select public.is_member())
         and (author_id = (select auth.uid()) or (select public.my_role()) = 'producer'));

-- ---------------------------------------------------------------------------
-- Privileges. Supabase grants everything to anon/authenticated by default;
-- tighten to exactly what the website needs. anon gets nothing.
-- service_role / postgres (producer SQL) keep full access.
-- ---------------------------------------------------------------------------
revoke all on public.topics, public.allowed_emails, public.profiles, public.items,
              public.item_topics, public.episodes, public.item_episodes, public.comments,
              public.item_cards, public.this_week
  from anon, authenticated;

grant select on public.topics, public.profiles, public.items, public.item_topics,
                public.episodes, public.item_episodes, public.comments,
                public.item_cards, public.this_week
  to authenticated;

grant insert, delete on public.items, public.item_topics, public.episodes,
                        public.item_episodes, public.comments
  to authenticated;

grant update (display_name) on public.profiles to authenticated;
grant update (title, url, source, published_at, summary, talking_points, quote,
              item_type, status, guest_name, why_them, contact_status)
  on public.items to authenticated;
grant update (title, recording_date, status, notes) on public.episodes to authenticated;
grant update (body) on public.comments to authenticated;

revoke execute on function public.sync_profile(uuid) from public, anon, authenticated;
revoke execute on function public.add_item(text, text, text, date, text, text[], text,
  public.item_type, public.item_status, text[], text, text, public.guest_contact_status)
  from public, anon;
grant execute on function public.add_item(text, text, text, date, text, text[], text,
  public.item_type, public.item_status, text[], text, text, public.guest_contact_status)
  to authenticated;
revoke execute on function public.my_role(), public.is_member() from public, anon;
grant execute on function public.my_role(), public.is_member() to authenticated;
