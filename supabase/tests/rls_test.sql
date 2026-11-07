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
select tests.eq((select count(*) from public.topics)::int, 17, 'host sees 17 topics');
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
