-- Schema + RLS tests. Run with scripts/test-db.sh (plain Postgres + 00_supabase_stub.sql).
\set ON_ERROR_STOP on
\set QUIET on

\set freddy   '11111111-1111-1111-1111-111111111111'
\set stew     '22222222-2222-2222-2222-222222222222'
\set mike     '33333333-3333-3333-3333-333333333333'
\set rando    '44444444-4444-4444-4444-444444444444'
\set producer '55555555-5555-5555-5555-555555555555'

create schema tests;
grant usage on schema tests to public;

create function tests.eq(actual anyelement, expected anyelement, label text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL %: expected %, got %', label, expected, actual;
  end if;
  raise notice 'ok - %', label;
end $$;

create function tests.throws(stmt text, expected_state text, label text, expected_msg text default null)
returns void language plpgsql as $$
declare st text; msg text;
begin
  begin
    execute stmt;
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text;
    if st <> expected_state then
      raise exception 'FAIL %: expected SQLSTATE %, got % (%)', label, expected_state, st, msg;
    end if;
    if expected_msg is not null and position(expected_msg in msg) = 0 then
      raise exception 'FAIL %: message "%" does not contain "%"', label, msg, expected_msg;
    end if;
    raise notice 'ok - % [% %]', label, st, msg;
    return;
  end;
  raise exception 'FAIL %: expected SQLSTATE % but the statement succeeded', label, expected_state;
end $$;

create function tests.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claims',
                    case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end,
                    false)
$$;

-- ===========================================================================
-- Allow-list -> profiles
-- ===========================================================================
insert into auth.users (id, email, email_confirmed_at) values
  (:'freddy', 'freddy@example.com', now()),
  (:'rando',  'rando@example.com',  now()),
  (:'mike',   'mike@example.com',   null);
select tests.eq((select count(*) from public.profiles)::int, 0, 'no profiles before allow-listing');

insert into public.allowed_emails (email, display_name, role) values
  ('freddy@example.com',   'Freddy',   'host'),
  ('stew@example.com',     'Stew',     'host'),
  ('mike@example.com',     'Mike',     'host'),
  ('producer@example.com', 'Producer', 'producer');
select tests.eq((select count(*) from public.profiles)::int, 1, 'allow-listing an existing confirmed user creates a profile');

insert into auth.users (id, email, email_confirmed_at) values
  (:'stew',     'Stew@Example.com',     now()),
  (:'producer', 'producer@example.com', now());
select tests.eq((select count(*) from public.profiles)::int, 3, 'new allow-listed user gets a profile (email case-insensitive)');
select tests.eq((select count(*) from public.profiles where id = :'mike')::int, 0, 'unconfirmed email gets no profile');

update auth.users set email_confirmed_at = now() where id = :'mike';
select tests.eq((select display_name from public.profiles where id = :'mike'), 'Mike', 'confirming email creates the profile');

delete from public.allowed_emails where email = 'mike@example.com';
select tests.eq((select count(*) from public.profiles where id = :'mike')::int, 0, 'removing from allow-list removes the profile');
insert into public.allowed_emails (email, display_name) values ('mike@example.com', 'Mike');
select tests.eq((select role::text from public.profiles where id = :'mike'), 'host', 're-adding restores the profile');
select tests.eq((select count(*) from public.profiles where id = :'rando')::int, 0, 'non-allow-listed user has no profile');

select tests.throws($$insert into public.allowed_emails (email, display_name) values ('Bad@Example.com', 'x')$$,
                    '23514', 'allow-list emails must be lower-case');

-- ===========================================================================
-- Producer path: direct SQL as postgres (what the Supabase connector does)
-- ===========================================================================
select public.add_item(
  title          => 'Why men stopped going to church',
  url            => 'https://www.example.com/news/men-church/?utm_source=newsletter&utm_medium=email',
  source         => 'Example Times',
  published_at   => '2026-11-04',
  summary        => 'Two to five sentences written by the producer.',
  talking_points => array['Is church attendance a manhood issue?', 'What did your dad model?'],
  quote          => 'A pull quote.',
  status         => 'this_week',
  topics         => array['religion', 'news']
) as art \gset

select tests.eq((select added_by_role::text from public.items where id = :'art'), 'producer', 'SQL insert is labelled producer');
select tests.eq((select added_by from public.items where id = :'art'), null::uuid, 'SQL insert has no added_by');
select tests.eq((select topics from public.item_cards where id = :'art'), array['news', 'religion'], 'topics come back in tab order');
select tests.eq((select added_by_name from public.item_cards where id = :'art'), 'Producer', 'item_cards labels producer rows');
select tests.eq((select talking_points[2] from public.items where id = :'art'), 'What did your dad model?', 'talking points stored as array');

select public.add_item(title => 'Octopuses have three hearts', item_type => 'fun_fact', status => 'this_week') as ff \gset
select tests.eq((select topics from public.item_cards where id = :'ff'), array['fun-facts'], 'fun_fact auto-tagged fun-facts');

select public.add_item(title => 'Guest: a pastor who lifts', item_type => 'guest_idea',
                       guest_name => 'Pastor Example', why_them => 'Bridges faith and fitness',
                       contact_status => 'not_contacted', topics => array['working-out']) as guest \gset
select tests.eq((select topics from public.item_cards where id = :'guest'), array['working-out', 'guests'], 'guest_idea auto-tagged guests');

-- raw inserts work too
insert into public.items (title, url, source, published_at, summary, talking_points)
values ('Raw insert article', 'https://news.example.org/story-1', 'Example Org', '2026-11-03T15:00:00Z', 's', '{"a","b"}')
returning id as raw \gset
insert into public.item_topics (item_id, topic_slug) values (:'raw', 'economics');
select tests.eq((select published_at from public.items where id = :'raw'), '2026-11-03'::date, 'timestamp text casts to date');
insert into public.comments (item_id, body) values (:'art', 'Producer note: open with this.');
select tests.eq((select author_role::text from public.comments where item_id = :'art'), 'producer', 'SQL comment is labelled producer');

-- duplicate URLs
select tests.throws($$select public.add_item(title => 'dup', url => 'http://example.com/news/men-church#comments')$$,
                    '23505', 'add_item rejects duplicate URL (normalised) with a readable message',
                    'Duplicate URL: already saved as "Why men stopped going to church" (status: this_week');
select tests.throws($$insert into public.items (title, url) values ('dup', 'https://example.com/news/men-church')$$,
                    '23505', 'raw insert rejects duplicate URL', 'items_url_unique');
-- documented producer snippets (docs/PRODUCER.md)
insert into public.items (title, url) values ('dup, skipped', 'https://example.com/news/men-church?fbclid=1')
on conflict (url_key) do nothing;
select tests.eq((select count(*) from public.items where title = 'dup, skipped')::int, 0, 'on conflict (url_key) do nothing skips duplicates');
with i as (
  insert into public.items (title, url, source, published_at, summary, talking_points, item_type)
  values ('CTE insert', 'https://example.com/cte', 'NYT', '2026-11-05', 'Summary.', array['Q1', 'Q2'], 'article')
  returning id
)
insert into public.item_topics (item_id, topic_slug)
select id, unnest(array['politics', 'economics']) from i;
select tests.eq((select topics from public.item_cards where title = 'CTE insert'), array['politics', 'economics'], 'documented CTE insert tags topics');
select tests.eq(public.normalize_url('https://youtu.be/AbC123?si=xyz'), 'youtube.com/watch?v=AbC123', 'youtu.be normalised');
select tests.eq(public.normalize_url('https://m.youtube.com/watch?v=AbC123&t=42&utm_source=x'), 'youtube.com/watch?t=42&v=AbC123', 'youtube tracking stripped, timestamp kept');
select tests.eq(public.normalize_url('https://www.youtube.com/watch?v=abc123'), 'youtube.com/watch?v=abc123', 'video ids keep case');
insert into public.items (title, item_type) values ('Note one', 'note'), ('Note two', 'note');
select tests.eq((select count(*) from public.items where url is null)::int, 4, 'many items without URL allowed');

select tests.throws($$select public.add_item(title => 'x', topics => array['finance', 'religion'])$$,
                    '23503', 'unknown topic slug is rejected and lists valid slugs', 'Unknown topic slug(s): finance. Valid slugs: news, politics');
select tests.throws($$insert into public.item_topics (item_id, topic_slug) values (gen_random_uuid(), 'news')$$,
                    '23503', 'item_topics needs an existing item');
select tests.throws($$select public.add_item(title => 'x', url => 'www.example.com/a')$$,
                    '23514', 'URL must start with http(s)://');
select tests.throws($$select public.add_item(title => 'x', item_type => 'artcle')$$,
                    '22P02', 'bad item_type is rejected', 'invalid input value for enum item_type');
select tests.throws($$select public.add_item(title => '  ')$$, '23514', 'blank title rejected');

-- ===========================================================================
-- anon: nothing
-- ===========================================================================
set role anon;
select tests.throws('select count(*) from public.items',      '42501', 'anon cannot read items');
select tests.throws('select count(*) from public.item_cards', '42501', 'anon cannot read item_cards');
select tests.throws('select count(*) from public.topics',     '42501', 'anon cannot read topics');
select tests.throws($$select public.add_item(title => 'x')$$, '42501', 'anon cannot call add_item');
reset role;

-- ===========================================================================
-- Signed-in but not allow-listed
-- ===========================================================================
set role authenticated;
select tests.as_user(:'rando');
select tests.eq((select count(*) from public.items)::int,     0, 'non-member sees no items');
select tests.eq((select count(*) from public.this_week)::int, 0, 'non-member sees nothing this week');
select tests.eq((select count(*) from public.topics)::int,    0, 'non-member sees no topics');
select tests.eq((select count(*) from public.profiles)::int,  0, 'non-member sees no profiles');
select tests.throws($$insert into public.items (title) values ('spam')$$, '42501', 'non-member cannot insert items');
select tests.throws($$select public.add_item(title => 'spam')$$,      '42501', 'non-member cannot use add_item');
select tests.throws('select * from public.allowed_emails',             '42501', 'non-member cannot read allow-list');
reset role;

-- ===========================================================================
-- Freddy (host)
-- ===========================================================================
set role authenticated;
select tests.as_user(:'freddy');
select tests.eq((select count(*) from public.topics)::int, 18, 'host sees 18 topics');
select tests.eq((select count(*) from public.this_week)::int, 2, 'this_week view shows nominated items');
select tests.throws('select * from public.allowed_emails', '42501', 'host cannot read allow-list');

insert into public.items (title, url, added_by, added_by_role)
values ('Freddy found this', 'https://example.org/freddy', :'producer', 'producer')
returning id as fred_item \gset
select tests.eq((select added_by::text from public.items where id = :'fred_item'), :'freddy', 'host insert: added_by forced to self');
select tests.eq((select added_by_role::text from public.items where id = :'fred_item'), 'host', 'host insert: role forced to host');
select tests.eq((select added_by_name from public.item_cards where id = :'fred_item'), 'Freddy', 'item_cards shows host name');

select public.add_item(title => 'Host via add_item', url => 'https://example.net/x', topics => array['music']) as host_rpc \gset
select tests.eq((select added_by::text from public.items where id = :'host_rpc'), :'freddy', 'host add_item: attributed to host');

with u as (update public.items set status = 'used' where id = :'art' returning 1)
select tests.eq(count(*)::int, 1, 'host can mark producer item used') from u;
with u as (update public.items set contact_status = 'reached_out' where id = :'guest' returning 1)
select tests.eq(count(*)::int, 1, 'host can update guest contact status') from u;
select tests.throws(format('update public.items set summary = %L where id = %L', 'hijack', :'art'),
                    '42501', 'host cannot rewrite producer summary', 'Only the person who added this item');
select tests.throws(format('update public.items set talking_points = %L where id = %L', '{x}', :'art'),
                    '42501', 'host cannot rewrite producer talking points');
with u as (update public.items set summary = 'my summary', talking_points = '{one,two}' where id = :'fred_item' returning 1)
select tests.eq(count(*)::int, 1, 'host can edit own item text') from u;
select tests.throws(format('update public.items set added_by = null where id = %L', :'fred_item'),
                    '42501', 'host cannot change added_by');
select tests.throws(format('update public.items set created_at = now() where id = %L', :'fred_item'),
                    '42501', 'host cannot change created_at');
with d as (delete from public.items where id = :'art' returning 1)
select tests.eq(count(*)::int, 0, 'host cannot delete producer item') from d;

insert into public.item_topics (item_id, topic_slug) values (:'art', 'dating-culture');
select tests.eq((select 'dating-culture' = any(topics) from public.item_cards where id = :'art'), true, 'host can tag any item');

insert into public.comments (item_id, body, author_id, author_role)
values (:'art', 'Love this one', :'stew', 'producer') returning id as fred_comment \gset
select tests.eq((select author_id::text || '/' || author_role from public.comments where id = :'fred_comment'),
                :'freddy' || '/host', 'comment author forced to self');
select tests.eq((select comment_count from public.item_cards where id = :'art'), 2, 'comment_count in item_cards');

select tests.throws(format('update public.profiles set role = %L where id = %L', 'producer', :'freddy'),
                    '42501', 'host cannot promote self to producer');
with u as (update public.profiles set display_name = 'Fred' where id = :'freddy' returning 1)
select tests.eq(count(*)::int, 1, 'host can rename self') from u;
with u as (update public.profiles set display_name = 'Stewie' where id = :'stew' returning 1)
select tests.eq(count(*)::int, 0, 'host cannot rename others') from u;

insert into public.episodes (title, recording_date, created_by)
values ('Ep. 12: Church and the modern man', '2026-11-12', :'stew') returning id as ep \gset
select tests.eq((select created_by::text from public.episodes where id = :'ep'), :'freddy', 'episode creator forced to self');
insert into public.item_episodes (item_id, episode_id) values (:'art', :'ep'), (:'ff', :'ep');
select tests.eq((select :'ep' = any(episode_ids::text[]) from public.item_cards where id = :'art'), true, 'episode_ids in item_cards');
reset role;

-- ===========================================================================
-- Stew (host)
-- ===========================================================================
set role authenticated;
select tests.as_user(:'stew');
with u as (update public.comments set body = 'edited' where id = :'fred_comment' returning 1)
select tests.eq(count(*)::int, 0, 'host cannot edit another host''s comment') from u;
with d as (delete from public.comments where id = :'fred_comment' returning 1)
select tests.eq(count(*)::int, 0, 'host cannot delete another host''s comment') from d;
with d as (delete from public.episodes where id = :'ep' returning 1)
select tests.eq(count(*)::int, 0, 'host cannot delete another host''s episode') from d;
with u as (update public.episodes set status = 'recorded', notes = 'Recorded Tuesday' where id = :'ep' returning 1)
select tests.eq(count(*)::int, 1, 'host can update any episode') from u;
select tests.throws(format('update public.items set title = %L where id = %L', 'mine now', :'fred_item'),
                    '42501', 'host cannot rewrite another host''s item');
with d as (delete from public.item_episodes where item_id = :'ff' and episode_id = :'ep' returning 1)
select tests.eq(count(*)::int, 1, 'host can detach items from episodes') from d;
reset role;

-- ===========================================================================
-- Producer with a website login
-- ===========================================================================
set role authenticated;
select tests.as_user(:'producer');
with u as (update public.items set summary = 'Tightened summary' where id = :'fred_item' returning 1)
select tests.eq(count(*)::int, 1, 'producer login can edit any item text') from u;
with d as (delete from public.comments where id = :'fred_comment' returning 1)
select tests.eq(count(*)::int, 1, 'producer login can delete any comment') from d;
insert into public.items (title) values ('Producer via website') returning id as prod_web \gset
select tests.eq((select added_by_role::text from public.items where id = :'prod_web'), 'producer', 'producer login insert labelled producer');
reset role;

-- ===========================================================================
-- Highlights, topic ideas, research queue (migration 20261107)
-- ===========================================================================
select tests.as_user(null);
select public.add_item(title => 'Pitch: an episode on fasting', item_type => 'topic_idea',
                       summary => 'Why the early church fasted and what men gain from it.') as pitch \gset
select tests.eq((select item_type::text from public.items where id = :'pitch'), 'topic_idea', 'topic_idea item type works');

set role anon;
select tests.throws('select count(*) from public.item_highlights',   '42501', 'anon cannot read highlights');
select tests.throws('select count(*) from public.research_requests', '42501', 'anon cannot read research');
select tests.throws('select count(*) from public.research_queue',    '42501', 'anon cannot read research queue');
reset role;

set role authenticated;
select tests.as_user(:'freddy');
insert into public.item_highlights (item_id) values (:'art');
select tests.eq((select highlight_count from public.item_cards where id = :'art'), 1, 'highlight counted in item_cards');
select tests.eq((select highlighted_by[1]::text from public.item_cards where id = :'art'), :'freddy', 'highlighted_by lists the user');
select tests.throws(format('insert into public.item_highlights (item_id, user_id) values (%L, %L)', :'art', :'stew'),
                    '42501', 'cannot highlight on behalf of someone else');
select tests.throws(format('insert into public.item_highlights (item_id) values (%L)', :'art'),
                    '23505', 'double highlight rejected');
insert into public.item_highlights (item_id) values (:'pitch');

insert into public.research_requests (item_id, kind, request, requested_by, requested_by_role)
values (:'art', 'stats', 'Church attendance by sex and age, 2000-2026, with sources', :'stew', 'producer')
returning id as rq \gset
select tests.eq((select requested_by::text || '/' || requested_by_role from public.research_requests where id = :'rq'),
                :'freddy' || '/host', 'research requester forced to self');
select tests.eq((select item_title from public.research_queue where id = :'rq'), 'Why men stopped going to church',
                'research_queue carries item context');
select tests.eq((select research_open from public.item_cards where id = :'art'), 1, 'item_cards counts open research');
insert into public.research_requests (kind, request) values ('deep_research', 'History of the Promise Keepers movement')
returning id as rq2 \gset
reset role;

set role authenticated;
select tests.as_user(:'stew');
with h as (delete from public.item_highlights where item_id = :'art' and user_id = :'freddy' returning 1)
select tests.eq(count(*)::int, 0, 'cannot remove someone else''s highlight') from h;
with d as (delete from public.research_requests where id = :'rq' returning 1)
select tests.eq(count(*)::int, 0, 'host cannot delete another host''s research request') from d;
-- a host pastes an answer from Grok by hand
update public.research_requests set response = 'Pasted answer', sources = '{https://example.org/s}', answered_by = 'Grok'
where id = :'rq2';
select tests.eq((select status::text || '/' || answered_by || '/' || (answered_at is not null) from public.research_requests where id = :'rq2'),
                'done/Grok/true', 'pasting an answer closes the request and keeps the Grok label');
update public.research_requests set response = 'Edited by Stew' where id = :'rq2';
select tests.eq((select answered_by from public.research_requests where id = :'rq2'), 'Grok',
                'editing an answer keeps its explicit label');
insert into public.research_requests (kind, request) values ('fact_check', 'Is the 1 in 4 stat real?') returning id as rq3 \gset
update public.research_requests set response = 'Checked it myself: roughly right.' where id = :'rq3';
select tests.eq((select answered_by from public.research_requests where id = :'rq3'), 'Stew',
                'an unlabeled answer from the site is credited to the person');
select tests.throws(format('update public.research_requests set requested_by = %L where id = %L', :'stew', :'rq'),
                    '42501', 'cannot reassign a research request');
reset role;

-- the bot answers via SQL
select tests.as_user(null);
select public.answer_research(:'rq', 'Gen Z men now out-attend Gen Z women (Example survey, 2026).',
                              array['https://example.org/survey']);
select tests.eq((select status::text || '/' || answered_by || '/' || (answered_at is not null) || '/' || sources[1]
                   from public.research_requests where id = :'rq'),
                'done/Grok/true/https://example.org/survey', 'answer_research closes the request');
select tests.eq((select research_open || '/' || research_done from public.item_cards where id = :'art'), '0/1',
                'item_cards research counts update');
select tests.eq((select count(*) from public.research_queue)::int, 0, 'answered requests leave the queue');
select tests.throws($$select public.answer_research(gen_random_uuid(), 'x')$$, 'P0002', 'answer_research on unknown id');
select tests.throws(format('select public.answer_research(%L, %L)', :'rq', '  '), '23514', 'answer_research rejects empty answer');

set role authenticated;
select tests.as_user(:'producer');
with d as (delete from public.research_requests where id = :'rq2' returning 1)
select tests.eq(count(*)::int, 1, 'producer login can delete any research request') from d;
reset role;

select tests.as_user(null);
delete from public.items where id = :'pitch';
select tests.eq((select count(*) from public.item_highlights where item_id = :'pitch')::int, 0, 'highlights cascade with their item');

-- ===========================================================================
-- Grok memory (migration grok_memory)
-- ===========================================================================
select tests.as_user(null);
select public.remember('Always give sources with links and keep answers under 200 words.', 'instruction',
                       importance => 9, pinned => true) as m_rule \gset
select public.remember('Freddy prefers historical context and church history deep dives.', 'preference',
                       about_member => :'freddy', importance => 7, tags => array['history']) as m_fred \gset
select public.remember('Stew wants hard numbers and charts, not anecdotes.', 'preference',
                       about_member => :'stew', importance => 7) as m_stew \gset
select public.remember('Episode 11 covered fatherlessness statistics.', 'event', importance => 4) as m_event \gset
select tests.eq((select source::text || '/' || coalesce(created_by::text, 'none') from public.memories where id = :'m_fred'),
                'grok/none', 'bot memories are labelled grok');
select tests.eq(public.remember('Freddy prefers historical context and church-history deep dives!', 'preference',
                                about_member => :'freddy', importance => 8)::text, :'m_fred',
                'near-duplicate memory is reinforced, not duplicated');
select tests.eq((select reinforced_count || '/' || importance from public.memories where id = :'m_fred'), '1/8',
                'reinforcement bumps count and importance');
select tests.throws($$select public.remember('x', about_topic => 'finance')$$, '23503', 'remember validates topic slugs', 'Unknown topic slug');
select tests.eq((select content from public.recall('church history') limit 1),
                'Freddy prefers historical context and church history deep dives.', 'recall ranks the relevant memory first');
select tests.eq((select count(*) from public.recall('church histroy deep dive'))::int >= 1, true, 'recall tolerates typos (fuzzy match)');
select tests.eq((select count(*) from public.recall(about_member => :'freddy') r where r.content like 'Stew%')::int, 0,
                'recall about Freddy excludes Stew''s memories');
select tests.eq((select bool_or(r.pinned) from public.recall(about_member => :'freddy') r), true,
                'recall about a member includes pinned show rules');
select tests.eq((select access_count > 0 from public.memories where id = :'m_fred'), true, 'recall records access');

select public.revise_memory(:'m_stew', 'Stew wants hard numbers, charts and the original study link.', 'he asked for study links') as m_stew2 \gset
select tests.eq((select (invalid_at is not null) || '/' || superseded_by::text from public.memories where id = :'m_stew'),
                'true/' || :'m_stew2', 'revise retires the old memory and links the new one');
select tests.eq((select count(*) from public.recall('anecdotes'))::int, 0, 'retired memories are not recalled');
select public.forget(:'m_event', 'wrong episode number');
select tests.throws(format('select public.forget(%L)', :'m_event'), 'P0002', 'forget twice is an error');

select tests.eq((select jsonb_array_length(public.member_briefing(:'freddy') -> 'preferences')), 1, 'member_briefing lists preferences');
select tests.eq((select public.member_briefing(:'freddy') -> 'favorite_topics' -> 0 ->> 'topic') is not null, true,
                'member_briefing derives favorite topics from activity');
select tests.eq((select public.show_briefing() -> 'pinned' ->> 0), 'Always give sources with links and keep answers under 200 words.',
                'show_briefing carries pinned rules');
select tests.eq((select public.show_briefing() -> 'recently_covered') ? 'Why men stopped going to church', true,
                'show_briefing lists what has been covered');

select public.log_conversation('[{"role":"user","content":"What did we say about fasting last month?"},
                                 {"role":"assistant","content":"You planned a Lent episode on fasting and discipline."}]'::jsonb,
                               member_id => :'freddy', title => 'Fasting follow-up', summary => 'Lent episode idea') as conv \gset
select tests.eq((select title from public.search_conversations('fasting discipline') limit 1), 'Fasting follow-up',
                'search_conversations finds past talks');
select tests.throws($$select public.log_conversation('{"role":"user"}'::jsonb)$$, '22023', 'log_conversation needs an array');
select tests.eq((select requested_by is not null from public.research_queue limit 1) is not false, true, 'research_queue exposes requested_by');

set role anon;
select tests.throws($$select * from public.recall('x')$$, '42501', 'anon cannot recall');
select tests.throws('select count(*) from public.memories', '42501', 'anon cannot read memories');
reset role;

set role authenticated;
select tests.as_user(:'freddy');
select tests.eq((select count(*) from public.memory_cards where about_member = :'stew')::int, 0, 'host cannot see another host''s memories');
select tests.eq((select count(*) from public.memory_cards where about_member = :'freddy' and invalid_at is null)::int, 1, 'host sees own memories');
select tests.eq((select count(*) from public.memory_cards where about_member is null and invalid_at is null)::int, 1, 'host sees show memories');
select tests.throws(format($f$insert into public.memories (content, kind, about_member) values ('spy', 'fact', %L)$f$, :'stew'),
                    '42501', 'host cannot write memories about someone else');
select public.remember('I like history deep dives with primary sources.', 'preference', about_member => :'freddy') as m_self \gset
select tests.eq((select source::text || '/' || created_by::text from public.memories where id = :'m_self'),
                'member/' || :'freddy', 'self-written memories are attributed');
select tests.eq((select count(*) from public.recall(about_member => :'freddy'))::int >= 2, true, 'host can recall');
select tests.eq((select jsonb_array_length(public.member_briefing(:'stew') -> 'preferences')), 0, 'briefing respects privacy for other hosts');
select tests.eq((select count(*) from public.conversations)::int, 1, 'host sees own conversations');
with d as (delete from public.memories where id = :'m_rule' returning 1)
select tests.eq(count(*)::int, 0, 'host cannot delete the bot''s show rules') from d;
with d as (delete from public.memories where id = :'m_self' returning 1)
select tests.eq(count(*)::int, 1, 'host can delete memories about themselves') from d;
reset role;

set role authenticated;
select tests.as_user(:'stew');
select tests.eq((select count(*) from public.conversations)::int, 0, 'other hosts cannot see someone''s conversations');
select tests.eq((select count(*) from public.conversation_messages)::int, 0, 'nor their messages');
reset role;

set role authenticated;
select tests.as_user(:'producer');
select tests.eq((select count(*) from public.memory_cards where about_member = :'stew' and invalid_at is null)::int, 1,
                'producer sees everyone''s memories');
reset role;
select tests.as_user(null);

-- ===========================================================================
-- Source inbox (migration source_inbox)
-- ===========================================================================
select tests.as_user(null);
select tests.eq(public.html_to_text('<p>Hello&nbsp;&amp; <b>&#8220;world&#8221;</b> &mdash; test</p>'), 'Hello & “world” — test', 'html_to_text strips tags and entities');
select tests.eq(public.safe_timestamptz('Thu, 06 Nov 2026 09:30:00 EST') is not null, true, 'RFC-822 dates parse');
select tests.eq(public.safe_timestamptz('not a date'), null::timestamptz, 'bad dates become null');
select tests.eq(public.story_key('Young men return to church, survey finds - BBC News'), 'young men return to church survey finds', 'story_key drops outlet suffix and punctuation');

insert into public.feeds (name, url, topics) values ('Test Wire', 'https://wire.example.org/rss', '{religion,news}') returning id as feed_a \gset
insert into public.feeds (name, url, topics) values ('Test Atom', 'https://atom.example.org/feed', '{religion}') returning id as feed_b \gset

select tests.eq(public.ingest_feed_xml(:'feed_a', format($x$<?xml version="1.0" encoding="ISO-8859-1"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Wire</title>
<item><title>Survey finds young men returning to church faster than women</title><link>https://wire.example.org/2026/men-church</link>
  <description><![CDATA[<p>Gen Z men now attend&nbsp;more often.</p>]]></description><pubDate>%s</pubDate></item>
<item><title>Old news</title><link>https://wire.example.org/old</link><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate></item>
<item><title>Already saved story</title><link>http://example.com/news/men-church?utm_source=rss</link><dc:date>%s</dc:date></item>
<item><title>Stoicism for fathers &amp; sons</title><link>https://wire.example.org/stoic</link><content:encoded><![CDATA[<div>Seneca on raising boys</div>]]></content:encoded></item>
</channel></rss>$x$, to_char(now() - interval '2 hours', 'Dy, DD Mon YYYY HH24:MI:SS "GMT"'), to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))), 3,
  'RSS ingest adds fresh items and skips old ones');
select tests.eq(public.ingest_feed_xml(:'feed_a', '<rss><channel><item><title>Survey finds young men returning to church faster than women</title><link>https://wire.example.org/2026/men-church?utm_source=x</link></item></channel></rss>'), 0,
  're-ingest / tracking-param variant adds nothing (duplicate URL)');
select tests.eq((select preview from public.feed_entries where url = 'https://wire.example.org/2026/men-church'), 'Gen Z men now attend more often.', 'preview is plain text');
select tests.eq((select preview from public.feed_entries where url = 'https://wire.example.org/stoic'), 'Seneca on raising boys', 'content:encoded used when there is no description');
select tests.eq((select item_id::text from public.feed_entries where title = 'Already saved story'), :'art', 'entry matching a saved item is linked to it');

select tests.eq(public.ingest_feed_xml(:'feed_b', format($x$<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<entry><title>Young men are returning to church faster than women, survey finds</title><link rel="alternate" href="https://atom.example.org/a/men-church"/><published>%s</published><summary>Same story, other outlet.</summary></entry>
<entry><title>Completely different: a history of the barbell</title><link href="https://atom.example.org/a/barbell"/><updated>%s</updated></entry>
</feed>$x$, to_char(now() - interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))), 2, 'Atom ingest works');
select tests.eq((select outlet_count from public.source_inbox where title like 'Survey finds young men%'), 2,
  'same story from two outlets is grouped (outlet_count 2)');
select tests.eq((select outlets from public.source_inbox where title like 'Survey finds young men%'), array['Test Atom', 'Test Wire'], 'outlets listed');
select tests.eq((select count(*) from public.source_inbox where title like '%barbell%')::int, 1, 'unrelated story stays separate');
select tests.eq((select in_prep from public.source_inbox where title = 'Already saved story'), true, 'story already in the prep room is flagged');

select tests.eq(public.ingest_feed_xml(:'feed_b', '<html><body>Not a feed<br></body></html>'), 0, 'broken XML is rejected');
select tests.eq((select last_error like 'Not valid RSS/Atom%' from public.feeds where id = :'feed_b'), true, 'feed error recorded');

select id as e_story from public.feed_entries where url = 'https://wire.example.org/2026/men-church' \gset
select id as e_story_b from public.feed_entries where url = 'https://atom.example.org/a/men-church' \gset
select id as e_stoic from public.feed_entries where url = 'https://wire.example.org/stoic' \gset
select id as e_barbell from public.feed_entries where url = 'https://atom.example.org/a/barbell' \gset

set role anon;
select tests.throws('select count(*) from public.source_inbox', '42501', 'anon cannot read the source inbox');
reset role;
set role authenticated;
select tests.as_user(:'rando');
select tests.eq((select count(*) from public.source_inbox)::int, 0, 'non-member sees no sources');
reset role;

set role authenticated;
select tests.as_user(:'freddy');
select tests.throws($$insert into public.feeds (name, url) values ('x', 'https://x.example.org/rss')$$, '42501', 'hosts cannot add feeds');
select tests.throws($$select public.refresh_feeds()$$, '42501', 'hosts cannot force a refresh');
select public.set_feedback(:'e_stoic', 'more_like_this', reason => 'stoic angle');
select tests.eq((select my_feedback from public.source_inbox where entry_id = :'e_stoic'), array['more_like_this'], 'more like this recorded');
select public.set_feedback(:'e_barbell', 'not_interested', reason => 'covered it last month');
select tests.eq((select not_count from public.source_inbox where entry_id = :'e_barbell'), 1, 'not interested recorded');
select public.set_feedback(:'e_stoic', 'not_interested');
select tests.eq((select my_feedback from public.source_inbox where entry_id = :'e_stoic'), array['not_interested'], 'not interested cancels more-like-this');
select public.set_feedback(:'e_stoic', 'not_interested', turn_on => false);
select tests.eq((select my_feedback from public.source_inbox where entry_id = :'e_stoic'), '{}'::text[], 'feedback can be removed');
select public.discuss_entry(:'e_story', 'great opener') as disc_item \gset
select tests.eq((select added_by::text || '/' || status from public.items where id = :'disc_item'), :'freddy' || '/inbox', 'Discuss this adds the story to the inbox as the host');
select tests.eq((select in_prep from public.source_inbox where entry_id = :'e_story'), true, 'discussed story is marked in prep');
select tests.eq(public.discuss_entry(:'e_story_b')::text, :'disc_item', 'discussing the other outlet''s copy reuses the same item');
select tests.eq((select discuss_count from public.source_inbox where story_id = (select story_id from public.feed_entries where id = :'e_story')), 2, 'both discuss votes count toward the story');
select public.save_read('https://atom.example.org/a/barbell?utm_source=x', 'Barbell history summary.', array['Invented 1860s'], array['https://src.example.org'], 'solid', 'Barbell history');
select tests.eq((select summary from public.get_read('https://atom.example.org/a/barbell')), 'Barbell history summary.', 'read-once store returns a saved read');
select tests.eq((select read from public.source_inbox where entry_id = :'e_barbell'), true, 'source inbox shows the story was read');
select tests.eq((select count(*) from public.get_read('https://atom.example.org/a/barbell', interval '0 seconds'))::int, 0, 'stale reads are not returned');
select tests.eq(public.producer_digest() ? 'topics' and public.producer_digest() ? 'hosts', true, 'producer_digest has topics and hosts');
select tests.eq((public.producer_digest(only_topics => array['history']) -> 'topics') ? 'religion', false, 'only_topics narrows the digest');
select tests.eq((public.producer_digest() -> 'topics' -> 'religion' -> 0 ->> 'url') like 'https://%', true, 'digest stories carry their url');
select tests.eq((public.producer_digest() -> 'topics')::text like '%Survey finds young men%', false, 'digest leaves out stories already in the prep room');
select tests.eq((public.producer_digest() -> 'topics' -> 'religion' -> 0 ->> 'title') is not null, true, 'digest has a religion section');
select tests.eq((select bool_or(h ->> 'name' = 'Fred' and h ? 'not_interested') from jsonb_array_elements(public.producer_digest() -> 'hosts') h), true,
  'digest carries each host''s not-interested feedback');
reset role;

set role authenticated;
select tests.as_user(:'stew');
with d as (delete from public.source_feedback where member_id = :'freddy' returning 1)
select tests.eq(count(*)::int, 0, 'hosts cannot delete each other''s feedback') from d;
select tests.eq((select my_feedback from public.source_inbox where entry_id = :'e_barbell'), '{}'::text[], 'my_feedback is per person');
reset role;
select tests.as_user(null);

-- ===========================================================================
-- Railway worker + YouTube / podcasts (migration worker_media)
-- ===========================================================================
select tests.as_user(null);
select tests.eq(public.parse_duration('00:51:51'), 3111, 'hh:mm:ss durations parse');
select tests.eq(public.parse_duration('45:10'), 2710, 'mm:ss durations parse');
select tests.eq(public.parse_duration('3600'), 3600, 'second counts parse');
select tests.eq((select count(*) from public.feeds where kind in ('youtube', 'podcast'))::int >= 10, true, 'starter YouTube channels and podcasts seeded');

insert into public.feeds (name, kind, url, topics) values ('Test Channel', 'youtube', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCtest', '{science}') returning id as yt \gset
select tests.eq(public.ingest_feed_xml(:'yt', format($x$<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
<entry><id>yt:video:AAA</id><title>Why octopuses have three hearts</title><link rel="alternate" href="https://www.youtube.com/watch?v=AAA"/><published>%1$s</published>
 <media:group><media:title>x</media:title><media:thumbnail url="https://i.ytimg.com/vi/AAA/hqdefault.jpg" width="480" height="360"/><media:description>A video about cephalopods.</media:description>
 <media:community><media:statistics views="13100"/></media:community></media:group></entry>
<entry><title>A short</title><link rel="alternate" href="https://www.youtube.com/shorts/BBB"/><published>%1$s</published></entry>
</feed>$x$, to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))), 1, 'YouTube feed ingests videos and skips Shorts');
select tests.eq((select media_type || '/' || views || '/' || thumbnail_url || '/' || preview from public.feed_entries where url = 'https://www.youtube.com/watch?v=AAA'),
                'video/13100/https://i.ytimg.com/vi/AAA/hqdefault.jpg/A video about cephalopods.', 'video thumbnail, views and description captured');

insert into public.feeds (name, kind, url, topics) values ('Test Pod', 'podcast', 'https://pod.example.org/rss', '{history}') returning id as tpod \gset
select tests.eq(public.ingest_feed_xml(:'tpod', format($x$<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>Pod</title>
<item><title>Episode without a link</title><guid isPermaLink="false">gid://pod/ep-9</guid><pubDate>%s</pubDate>
<enclosure url="https://cdn.example.org/ep9.mp3" type="audio/mpeg" length="1"/><itunes:duration>00:51:51</itunes:duration></item></channel></rss>$x$,
  to_char(now(), 'Dy, DD Mon YYYY HH24:MI:SS "GMT"'))), 1, 'podcast episodes without <link> use the audio URL');
select tests.eq((select media_type || '/' || duration_seconds from public.feed_entries where url = 'https://cdn.example.org/ep9.mp3'), 'podcast/3111', 'audio-only episode stored as a podcast with duration');
select public.create_ingest_token() as tok \gset
select id as gn from public.feeds where name = 'CNN' \gset
select tests.throws($$select * from public.worker_sources('ta_ingest_wrong')$$, '28000', 'wrong ingest token is refused');
set role anon;
select tests.eq((select count(*) from public.worker_sources(:'tok'))::int > 20, true, 'worker (anon key + token) can list sources');
select tests.eq(public.worker_report(:'tok', :'yt', jsonb_build_object('status', 200, 'version', 'test', 'etag', '"v1"', 'entries', jsonb_build_array(
    jsonb_build_object('title', 'Episode 1: Fasting', 'url', 'https://pod.example.org/ep1', 'published_at', now(), 'media_type', 'podcast',
                       'media_url', 'https://cdn.example.org/ep1.mp3', 'duration_seconds', 3111, 'preview', '<p>Show notes</p>', 'transcript_url', 'https://pod.example.org/ep1.vtt'),
    jsonb_build_object('title', 'Why octopuses have three hearts', 'url', 'https://www.youtube.com/watch?v=AAA', 'views', 20000),
    jsonb_build_object('title', 'Short', 'url', 'https://www.youtube.com/shorts/CCC'),
    jsonb_build_object('title', '', 'url', 'https://pod.example.org/blank')))), 1, 'worker_report adds new entries only (dupes, Shorts, blanks skipped)');
select tests.throws(format('select count(*) from public.feed_entries'), '42501', 'the anon worker key still cannot read tables directly');
select tests.eq(public.worker_report(:'tok', :'yt', jsonb_build_object('status', 200, 'entries', jsonb_build_array(
    jsonb_build_object('title', 'Rerun episode', 'url', 'https://pod.example.org/rerun', 'views', 1),
    jsonb_build_object('title', 'Rerun episode (again)', 'url', 'https://pod.example.org/rerun?utm_source=feed', 'views', 2)))), 1,
  'the same link twice in one report is stored once (no ON CONFLICT error)');
select tests.eq(public.worker_report(:'tok', :'gn', jsonb_build_object('status', 200, 'entries', jsonb_build_array(
    jsonb_build_object('title', 'Senate passes the budget deal - CNN', 'url', 'https://news.google.com/rss/articles/CBMiTEST?oc=5',
                       'preview', 'Senate passes the budget deal - CNN CNN')))), 1, 'Google News entry stored');
select tests.eq(public.worker_report(:'tok', :'gn', jsonb_build_object('status', 200, 'entries', jsonb_build_array(
    jsonb_build_object('title', 'XOM Stock Quote Price and Forecast', 'url', 'https://news.google.com/rss/articles/QUOTE'),
    jsonb_build_object('title', 'Don’t sleep on these early Black Friday mattress deals - CNN', 'url', 'https://news.google.com/rss/articles/DEALS'),
    jsonb_build_object('title', '20 Harry Potter gifts for fans', 'url', 'https://news.google.com/rss/articles/GIFTS')))), 0,
  'shopping and stock-quote pages are not stored');
select tests.eq((select count(*) from public.worker_sources(:'tok') w where w.backfill)::int > 20, true, 'sources not yet backfilled are flagged for the month backfill');
select tests.eq(public.worker_report(:'tok', :'gn', jsonb_build_object('status', 200, 'entries', jsonb_build_array(
    jsonb_build_object('title', 'Three weeks ago: storm recovery begins', 'url', 'https://gn.example.org/old-20', 'published_at', now() - interval '20 days'),
    jsonb_build_object('title', 'Six weeks ago: too old to keep', 'url', 'https://gn.example.org/old-40', 'published_at', now() - interval '40 days')))), 1,
  'backfilled headlines up to 35 days old are accepted, older ones dropped');
select tests.eq(public.worker_report(:'tok', :'gn', jsonb_build_object('status', 200, 'append', true, 'backfilled', true, 'entries', jsonb_build_array(
    jsonb_build_object('title', 'Second chunk headline', 'url', 'https://gn.example.org/chunk-2', 'published_at', now() - interval '9 days')))), 1,
  'a later chunk of the same run is accepted');
reset role;
select tests.eq((select (backfilled_at is not null)::text || '/' || last_new_count from public.feeds where id = :'gn'), 'true/2',
                'last chunk marks the source backfilled; chunk counts add up');
select tests.eq((select count(*) from public.worker_sources(:'tok') w where w.id = :'gn' and not w.backfill)::int, 1, 'a backfilled source is not backfilled again');
set role anon;
reset role;
select tests.eq((select title || '|' || coalesce(preview, '(none)') from public.feed_entries where url = 'https://news.google.com/rss/articles/CBMiTEST?oc=5'),
                'Senate passes the budget deal|(none)', 'Google News " - Outlet" suffix and echoed preview are stripped');
select tests.eq((select count(*) from public.feeds where 'motivation' = any(topics))::int >= 6, true, 'motivation sources seeded');

-- Categorisation
select tests.eq(public.classify_topics('Pope Leo urges South America to bridge divides on Uruguay stop'), array['religion'], 'classifier: pope -> religion');
select tests.eq((public.classify_topics('Fed holds interest rates steady as inflation cools'))[1], 'economics', 'classifier: rates and inflation -> economics');
select tests.eq(public.classify_topics('Senate passes the budget deal'), array['politics'], 'classifier: senate -> politics');
select tests.eq(public.classify_topics('Marvel moves the next Avengers sequel to 2027'), array['movies'], 'classifier: Marvel sequel -> movies');
select tests.eq(public.classify_topics('Volunteers rebuild a widow''s home after the flood'), array['motivation'], 'classifier: volunteers -> motivation');
select tests.eq(public.classify_topics('Gunman opens fire in Krakow, killing 6 people'), '{}'::text[], 'classifier: nothing forced when no topic fits');
select tests.eq(public.classify_topics('Tractor-trailer crash closes I-95'), '{}'::text[], 'classifier: whole words only (no "trailer" -> movies)');
select tests.eq(public.classify_topics('Officials meet in Geneva', 'The church leaders and the church council...'), array['religion'], 'classifier: two preview hits count');
select tests.eq(public.classify_topics('Officials meet in Geneva', 'A church spokesman declined to comment.'), '{}'::text[], 'classifier: one preview hit does not');
select tests.eq(public.entry_topics(array['news'], 'Pope Leo visits Uruguay'), array['religion', 'news'], 'general news feed: detected topic comes first');
select tests.eq(public.entry_topics(array['religion'], 'A history of the early church'), array['religion', 'history'], 'specialised feed keeps its own topic first');
select tests.eq((select topics from public.feed_entries where url = 'https://news.google.com/rss/articles/CBMiTEST?oc=5'), array['politics', 'news'],
                'incoming headlines are filed automatically');
select tests.throws($$insert into public.topic_terms (topic, term) values ('religion', 'bad(term')$$, '2201B', 'invalid topic terms are rejected');
select tests.eq((select 'working-out' = any(topics) from public.feed_entries where url = 'https://atom.example.org/a/barbell'), false, 'before: barbell story not in Working Out');
insert into public.topic_terms (topic, term) values ('working-out', 'barbells?');
select tests.eq(public.reclassify_entries() >= 1, true, 'reclassify_entries re-files stored headlines after a term change');
select tests.eq((select topics from public.feed_entries where url = 'https://atom.example.org/a/barbell'), array['religion', 'history', 'working-out'],
                'after: the new term files it under Working Out too');
insert into public.feed_entries (feed_id, url, title, published_at, topics) values
  (:'gn', 'https://gn.example.org/keep-90', 'Ninety days old: the archive keeps it', now() - interval '90 days', '{news}'),
  (:'gn', 'https://gn.example.org/drop-400', 'Over a year old and pruned', now() - interval '400 days', '{news}'),
  (:'gn', 'https://gn.example.org/pope', 'Pope Leo visits Uruguay', now() - interval '2 days', '{news}');
select public.prune_feed_entries();
select tests.eq((select string_agg(url, ',' order by url) from public.feed_entries where url in ('https://gn.example.org/keep-90', 'https://gn.example.org/drop-400')),
                'https://gn.example.org/keep-90', 'headlines are kept up to a year (keep_days 365)');
select tests.eq((select count(*) from public.source_inbox where url = 'https://gn.example.org/keep-90')::int, 0, 'the inbox shows the last 62 days only');
select tests.eq((select source || '/' || published from public.search_headlines('archive keeps')), 'CNN/' || (now() - interval '90 days')::date,
                'search_headlines finds older headlines (every word, any order)');
select tests.eq((select count(*) from public.search_headlines('archive banana'))::int, 0, 'search_headlines needs every word');
select tests.eq((select count(*) from public.search_headlines('pope', topic => 'religion'))::int >= 1, true, 'search_headlines filters by topic');
select tests.eq((select count(*) from public.search_headlines(since => (now() - interval '100 days')::date, until => (now() - interval '80 days')::date))::int, 1,
                'search_headlines filters by date range');
-- Size cap: the oldest headlines nobody acted on go first; prep-room and voted headlines stay.
update public.ingest_state set max_headlines = 1000 where id;
insert into public.feed_entries (feed_id, url, title, published_at, topics)
select :'gn', 'https://gn.example.org/bulk-' || g, 'Bulk headline number ' || g, now() - make_interval(hours => g), '{news}'
from generate_series(1, 1000) g;
select tests.eq(public.prune_feed_entries() > 0, true, 'over the cap, prune removes headlines');
select tests.eq((select count(*) from public.feed_entries)::int, 1000, 'headline count is held at max_headlines');
select tests.eq((select count(*) from public.feed_entries where url in ('https://gn.example.org/bulk-1', 'https://gn.example.org/bulk-1000'))::int || '/' ||
                (select count(*) from public.feed_entries where url = 'https://gn.example.org/bulk-1')::int, '1/1', 'the oldest go first, the newest stay');
select tests.eq((select count(*) from public.feed_entries where id = :'e_barbell')::int, 1, 'headlines with crew votes are never pruned');
select tests.eq((select count(*) from public.feed_entries where item_id is not null)::int > 0, true, 'headlines in the prep room are never pruned');
select tests.throws('update public.ingest_state set max_headlines = 10 where id', '23514', 'cap has a sane floor');
update public.ingest_state set keep_days = 14, max_headlines = 150000 where id;
select public.prune_feed_entries();
select tests.eq((select count(*) from public.feed_entries where url = 'https://gn.example.org/bulk-500')::int, 0, 'keep_days is adjustable');
update public.ingest_state set keep_days = 365, max_headlines = 150000 where id;
set role authenticated;
select tests.as_user(:'stew');
select tests.throws('select public.reclassify_entries()', '42501', 'hosts cannot re-file headlines');
select tests.eq((select count(*) from public.topic_terms)::int > 300, true, 'members can read the topic word lists');
select tests.throws($$insert into public.topic_terms (topic, term) values ('music', 'kazoo')$$, '42501', 'hosts cannot edit topic word lists');
reset role;
select tests.as_user(null);
select tests.eq((select duration_seconds || '/' || media_type || '/' || preview || '/' || transcript_url from public.feed_entries where url = 'https://pod.example.org/ep1'),
                '3111/podcast/Show notes/https://pod.example.org/ep1.vtt', 'podcast duration, audio, notes and transcript stored');
select tests.eq((select views from public.feed_entries where url = 'https://www.youtube.com/watch?v=AAA'), 20000::bigint, 'view counts refresh on re-report');
select tests.eq((select etag || '/' || last_status from public.feeds where id = :'yt'), '"v1"/200', 'etag and status recorded for conditional fetches');
select tests.eq((select worker_version from public.ingest_state), 'test', 'worker run recorded');
select tests.eq(public.enqueue_feed_fetches(), 0, 'database fetcher stays idle while the worker is healthy');
select tests.eq(public.ingest_status() ->> 'mode', 'worker', 'ingest_status reports worker mode');

insert into public.feeds (name, kind, url, resolved, topics) values ('Pending Podcast', 'podcast', 'https://itunes.apple.com/search?media=podcast&term=pending', false, '{history}') returning id as pend \gset
select tests.eq(public.worker_report(:'tok', :'pend', '{"status":200,"url":"https://feeds.example.org/pending.rss","entries":[]}'::jsonb), 0, 'worker can report a resolved feed URL');
select tests.eq((select resolved::text || '/' || url || '/' || input_url from public.feeds where id = :'pend'),
                'true/https://feeds.example.org/pending.rss/https://itunes.apple.com/search?media=podcast&term=pending', 'resolution stores the feed URL and keeps the input');
select tests.eq(public.worker_report(:'tok', :'pend', '{"status":200,"url":"https://www.youtube.com/feeds/videos.xml?channel_id=UCtest"}'::jsonb), 0, 'resolving to an existing source is handled');
select tests.eq((select active::text || '/' || (last_error like 'Resolves to a feed that is already a source%')::text from public.feeds where id = :'pend'), 'false/true', 'duplicate source is paused with a clear error');
select tests.eq(public.worker_report(:'tok', :'yt', '{"status":404,"error":"HTTP 404"}'::jsonb), 0, 'worker reports fetch errors');
select tests.eq((select last_error from public.feeds where id = :'yt'), 'HTTP 404', 'fetch error shown on the source');

update public.ingest_state set worker_last_run_at = now() - interval '2 hours';
select tests.eq(public.ingest_status() ->> 'mode', 'database', 'after an hour without the worker, the database fetcher takes over');

set role authenticated;
select tests.as_user(:'stew');
select tests.throws($$select public.create_ingest_token()$$, '42501', 'hosts cannot create worker tokens');
select tests.throws('select * from public.ingest_tokens', '42501', 'token hashes are not readable from the site');
select tests.eq((select media_type from public.source_inbox where url = 'https://www.youtube.com/watch?v=AAA'), 'video', 'source_inbox exposes media type');
reset role;
select tests.as_user(null);
select tests.eq((public.producer_digest(only_topics => array['science']) -> 'topics' -> 'science')::text like '%"type": "video"%', true, 'digest marks videos');
select public.revoke_ingest_tokens();
select tests.throws(format('select * from public.worker_sources(%L)', :'tok'), '28000', 'revoked tokens stop working');

-- ===========================================================================
-- Quote of the show
-- ===========================================================================
select tests.as_user(null);
select tests.eq((select count(*) from public.quotes where verified and nullif(btrim(source), '') is not null)::int >= 20, true, 'starter bank of verified, sourced quotes');
select tests.throws($$insert into public.quotes (text, author, verified) values ('Unsourced but verified?', 'Someone', true)$$, '23514', 'verified quotes must cite a source');
select tests.throws($$insert into public.quotes (text, author, topics) values ('Bad topic', 'Someone', '{finance}')$$, '23503', 'quote topics are validated');
select tests.throws($$insert into public.quotes (text, author) values ('"Iron sharpeneth iron, so a man sharpeneth the countenance of his friend!"', 'Anon')$$, '23505', 'the same quote cannot be added twice');

set role authenticated;
select tests.as_user(:'stew');
insert into public.episodes (title) values ('Ep. 13: Work') returning id as ep13, quote_id as q13 \gset
insert into public.episodes (title) values ('Ep. 14: Courage') returning id as ep14, quote_id as q14 \gset
select tests.eq(:'q13' <> '' and :'q14' <> '', true, 'new episodes get a quote automatically');
select tests.eq(:'q13' <> :'q14', true, 'two new episodes get different (least-used) quotes');
select tests.eq((select quote_role::text from public.episodes where id = :'ep13'), 'closer', 'default role is the closer');
select tests.eq(public.swap_quote(:'ep13')::text <> :'q13', true, 'swap_quote gives the episode a different quote');
update public.episodes set quote_role = 'opener' where id = :'ep13';
select tests.eq((select quote_role::text from public.episodes where id = :'ep13'), 'opener', 'hosts can make it the opener');
insert into public.quotes (text, author, source, questions, topics)
values ('“Do the next right thing.”', 'Stew''s grandfather', 'Family saying', array['What''s the next right thing for you?', ' '], '{motivation}')
returning id as q_stew \gset
select tests.eq((select added_by::text || '/' || verified::text || '/' || text || '/' || array_length(questions, 1) from public.quotes where id = :'q_stew'),
                :'stew' || '/false/Do the next right thing./1', 'hosts add quotes (credited, unverified, quote marks and blank questions stripped)');
update public.episodes set quote_id = :'q_stew' where id = :'ep14';
select tests.eq((select used_count || '/' || used_in[1] || '/' || added_by_name from public.quote_cards where id = :'q_stew'), '1/Ep. 14: Courage/Stew', 'quote_cards shows where a quote was used');
delete from public.quotes where id = (select id from public.quotes where added_by is null limit 1);
select tests.eq((select count(*) from public.quotes where added_by is null)::int >= 20, true, 'hosts cannot delete quotes they did not add');
select tests.as_user(:'freddy');
update public.quotes set text = 'Hijacked' where id = :'q_stew';
select tests.eq((select text from public.quotes where id = :'q_stew'), 'Do the next right thing.', 'hosts cannot edit someone else''s quote');
select tests.as_user(:'stew');
delete from public.quotes where id = :'q_stew';
select tests.eq((select quote_id from public.episodes where id = :'ep14'), null::uuid, 'deleting your quote clears it from the episode');
reset role;
set role anon;
select tests.throws('select count(*) from public.quotes', '42501', 'anon cannot read quotes');
reset role;
select tests.as_user(null);
select public.add_quote('Grok test quote about grit.', 'Test Author', 'Test source', episode_id => :'ep14', role => 'opener') as q_grok \gset
select tests.eq((select quote_id::text || '/' || quote_role from public.episodes where id = :'ep14'), :'q_grok' || '/opener', 'add_quote can put a quote on an episode');
select tests.eq((select count(*) from jsonb_array_elements(public.producer_digest() -> 'episodes') e where e ? 'quote')::int >= 1, true, 'the digest shows episode quotes');
update public.episodes set quote_id = null where id = :'ep14';
select tests.eq((select count(*) from jsonb_array_elements(public.producer_digest() -> 'episodes') e where (e ->> 'needs_quote')::boolean)::int >= 1, true, 'the digest flags episodes that need a quote');
delete from public.episodes where id in (:'ep13', :'ep14');

-- ===========================================================================
-- Overnight debug fixes
-- ===========================================================================
select tests.as_user(null);
insert into public.feed_entries (feed_id, url, title, published_at, topics) values
  (:'gn', 'https://news.google.com/rss/articles/DUP1', 'Mayor unveils plan to rebuild the old harbor bridge', now() - interval '1 hour', '{news}'),
  (:'gn', 'https://news.google.com/rss/articles/DUP2', 'Mayor unveils plan to rebuild the old harbor bridge', now() - interval '30 minutes', '{news}');
select tests.eq((select count(distinct story_id) from public.feed_entries where url like 'https://news.google.com/rss/articles/DUP_')::int, 1,
                'the same source repeating a headline joins one story');
select tests.eq((select outlet_count from public.source_inbox where title = 'Mayor unveils plan to rebuild the old harbor bridge'), 1,
                '"outlets" counts sources, not copies');
insert into public.feed_entries (feed_id, url, title, topics) values
  (:'gn', 'https://gn.example.org/horoscope', 'Your Positive Weekly Horoscope: Free Will Astrology', '{news}'),
  (:'gn', 'https://gn.example.org/gifts', 'The 21 best collectible gifts your loved ones will love', '{news}'),
  (:'gn', 'https://gn.example.org/costco', '7 Costco Thanksgiving food deals and steals that shoppers can''t miss', '{news}'),
  (:'gn', 'https://gn.example.org/tradedeal', 'Trump strikes deal with Putin to supply Russian diesel', '{news}');
select tests.eq((select string_agg(url, ',') from public.feed_entries where url like 'https://gn.example.org/%' and url ~ '(horoscope|gifts|costco|tradedeal)$'),
                'https://gn.example.org/tradedeal', 'junk filter drops horoscopes and shopping round-ups but keeps real "deal" news');
select tests.eq(to_regclass('public.r') is null, true, 'no stray tables left by migrations');
update public.feeds set outlet = 'Test Wire Group' where id in (:'feed_a', :'feed_b');
select tests.eq((select outlet_count from public.source_inbox where title like 'Survey finds young men%'), 1,
                'two feeds of one outlet count as one outlet');
update public.feeds set outlet = null where id in (:'feed_a', :'feed_b');
select tests.eq((select outlet_count from public.source_inbox where title like 'Survey finds young men%'), 2,
                'different outlets still count separately');
select tests.eq(public.ingest_feed_xml(:'feed_a', '<rss><channel><item><title>Survey finds young men returning to church faster than women</title><link>https://wire.example.org/2026/men-church</link></item></channel></rss>'), 0,
                'backup fetcher skips headlines already stored');

update public.feed_entries set story_id = gen_random_uuid() where url = 'https://news.google.com/rss/articles/DUP2';
select tests.eq(public.regroup_duplicate_stories(), 1, 'regroup_duplicate_stories folds a split duplicate back in');
select tests.eq((select count(distinct story_id) from public.feed_entries where url like 'https://news.google.com/rss/articles/DUP_')::int, 1,
                'after regrouping, the duplicate is one story again');
select tests.eq(public.regroup_duplicate_stories(), 0, 'regrouping again changes nothing');
select tests.eq(has_function_privilege('authenticated', 'public.items_auto_topic()', 'execute')
                or has_function_privilege('anon', 'public.on_auth_user_change()', 'execute'), false, 'trigger functions are not callable over the API');
select public.remember('Touch-test memory for the overnight debug.', 'fact') as m_touch \gset
set role authenticated;
select tests.as_user(:'rando');
select public.touch_memories(array[:'m_touch']::uuid[]);
reset role;
select tests.as_user(null);
select tests.eq((select access_count from public.memories where id = :'m_touch'), 0, 'non-members cannot bump memory counters');
set role authenticated;
select tests.as_user(:'producer');
insert into public.topic_terms (topic, term) values ('history', 'night-debug-term');
select tests.eq((select count(*) from public.topic_terms where term = 'night-debug-term')::int, 1, 'the producer can still add topic terms');
delete from public.topic_terms where term = 'night-debug-term';
select tests.eq((select count(*) from public.topic_terms where term = 'night-debug-term')::int, 0, 'the producer can still remove topic terms');
reset role;
select tests.as_user(null);

-- ===========================================================================
-- Crew availability (episode calendar)
-- ===========================================================================
set role authenticated;
select tests.as_user(:'stew');
insert into public.availability (day, status) values ('2026-12-05', 'free'), ('2026-12-06', 'busy');
select tests.eq((select count(*) from public.availability where member_id = :'stew')::int, 2, 'a host marks their own days (member_id filled in)');
select tests.throws($$insert into public.availability (member_id, day, status) values ('11111111-1111-1111-1111-111111111111', '2026-12-05', 'free')$$,
                    '42501', 'a host cannot set someone else''s availability');
update public.availability set status = 'maybe', note = 'after 3pm' where day = '2026-12-06';
select tests.eq((select status::text || '/' || note from public.availability where member_id = :'stew' and day = '2026-12-06'), 'maybe/after 3pm', 'a host updates their own day with a note');
select tests.as_user(:'freddy');
insert into public.availability (day, status) values ('2026-12-05', 'free');
update public.availability set status = 'busy' where member_id = :'stew' and day = '2026-12-05';
select tests.eq((select status::text from public.availability where member_id = :'stew' and day = '2026-12-05'), 'free', 'hosts cannot change another host''s availability');
select tests.eq((select count(*) from public.availability)::int >= 3, true, 'everyone sees the crew''s availability');
select tests.eq((select array_length(free, 1) = 2 and 'Stew' = any(free) from public.crew_availability('2026-12-05', 1)), true, 'crew_availability lists who is free');
select tests.eq((select everyone_free from public.crew_availability('2026-12-05', 1)), false, 'not everyone has said they are free');
select tests.eq((select count(*) from public.crew_availability('2026-12-01', 14))::int, 14, 'one row per day');
select tests.as_user(:'rando');
select tests.eq((select count(*) from public.availability)::int, 0, 'non-members see no availability');
reset role;
set role anon;
select tests.throws('select count(*) from public.availability', '42501', 'anon cannot read availability');
reset role;
select tests.as_user(null);
select tests.eq((select maybe from public.crew_availability('2026-12-06', 1)), array['Stew'], 'SQL sessions (Grok) can read availability');

-- ===========================================================================
-- Revoking access
-- ===========================================================================
select tests.as_user(null);
delete from public.allowed_emails where email = 'freddy@example.com';
set role authenticated;
select tests.as_user(:'freddy');
select tests.eq((select count(*) from public.items)::int, 0, 'removed member immediately loses access');
reset role;
select tests.as_user(null);
select tests.eq((select added_by from public.items where id = :'fred_item'), null::uuid, 'their items stay, unattributed');

\echo 'ALL TESTS PASSED'
