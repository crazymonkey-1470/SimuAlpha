-- Quote of the show: every episode carries one motivational quote, used as the opener
-- (wisdom / conversation starter) or the closer (send-off).
--
-- quotes          the bank. `verified` = the wording and attribution were checked against a primary source
--                 (the source must be cited). Unverified quotes are labelled on the site.
-- episodes        gain quote_id + quote_role. A new episode gets the least-used verified quote automatically;
--                 the crew can swap it, choose another from the bank, or flip opener/closer.
-- next_quote()    least-used verified quote (random among ties).
-- swap_quote()    give an episode a different quote.
-- add_quote()     one call for Grok: add a quote (and optionally put it on an episode).

create type public.quote_role as enum ('opener', 'closer');

create table public.quotes (
  id          uuid primary key default gen_random_uuid(),
  text        text not null check (length(btrim(text)) between 3 and 1200),
  author      text not null check (length(btrim(author)) between 1 and 200),
  source      text check (source is null or length(source) <= 300),
  source_url  text check (source_url is null or source_url ~* '^https?://\S+$'),
  context     text check (context is null or length(context) <= 1200),
  questions   text[] not null default '{}',
  topics      text[] not null default '{}',
  verified    boolean not null default false,
  added_by    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint quotes_verified_needs_source check (not verified or nullif(btrim(source), '') is not null)
);
create unique index quotes_text_unique on public.quotes (lower(regexp_replace(text, '\W+', '', 'g')));
comment on column public.quotes.verified is
  'True only when wording and attribution were checked against a primary source (cite it in source). '
  'Many famous quotes are misattributed; leave false when unsure.';

create function public.quotes_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  unknown text[];
begin
  select array_agg(t) into unknown from unnest(new.topics) t where not exists (select 1 from public.topics tp where tp.slug = t);
  if unknown is not null then
    raise exception 'Unknown topic slug(s): %. Valid slugs: %.', array_to_string(unknown, ', '),
      (select string_agg(tp.slug, ', ' order by tp.sort_order) from public.topics tp) using errcode = 'foreign_key_violation';
  end if;
  new.text := btrim(regexp_replace(new.text, '^[“"\s]+|[”"\s]+$', '', 'g'));
  new.author := btrim(new.author);
  new.questions := array(select btrim(q) from unnest(new.questions) q where nullif(btrim(q), '') is not null);
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.added_by := auth.uid();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger quotes_before_write before insert or update on public.quotes
  for each row execute function public.quotes_before_write();

alter table public.episodes
  add column quote_id   uuid references public.quotes (id) on delete set null,
  add column quote_role public.quote_role not null default 'closer';
create index episodes_quote_idx on public.episodes (quote_id);

alter table public.quotes enable row level security;
create policy "members read quotes"   on public.quotes for select to authenticated using ((select public.is_member()));
create policy "members add quotes"    on public.quotes for insert to authenticated with check ((select public.is_member()));
create policy "author or producer edits quotes" on public.quotes for update to authenticated
  using (added_by = (select auth.uid()) or (select public.my_role()) = 'producer')
  with check (added_by = (select auth.uid()) or (select public.my_role()) = 'producer');
create policy "author or producer removes quotes" on public.quotes for delete to authenticated
  using (added_by = (select auth.uid()) or (select public.my_role()) = 'producer');
revoke all on public.quotes from anon, authenticated;
grant select, insert, delete on public.quotes to authenticated;
grant update (text, author, source, source_url, context, questions, topics, verified) on public.quotes to authenticated;
grant update (quote_id, quote_role) on public.episodes to authenticated;

/** The least-used verified quote (random among ties), optionally not `exclude`. */
create function public.next_quote(exclude uuid default null)
returns uuid
language sql
volatile
set search_path = ''
as $$
  select q.id
  from public.quotes q
  where q.verified and q.id is distinct from next_quote.exclude
  order by (select count(*) from public.episodes e where e.quote_id = q.id), random()
  limit 1
$$;

create function public.episodes_default_quote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.quote_id is null then
    new.quote_id := public.next_quote();
  end if;
  return new;
end;
$$;
create trigger episodes_default_quote before insert on public.episodes
  for each row execute function public.episodes_default_quote();

/** Give an episode a different quote (least used first). Returns the new quote id. */
create function public.swap_quote(episode_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  cur uuid;
  nxt uuid;
begin
  select e.quote_id into cur from public.episodes e where e.id = swap_quote.episode_id;
  if not found then
    raise exception 'No episode with id %', swap_quote.episode_id using errcode = 'no_data_found';
  end if;
  nxt := public.next_quote(cur);
  update public.episodes e set quote_id = nxt where e.id = swap_quote.episode_id;
  return nxt;
end;
$$;

/** Grok / producer: add a quote to the bank and optionally put it on an episode. Returns the quote id. */
create function public.add_quote(quote text, author text, source text default null, context text default null,
                                 questions text[] default '{}', topics text[] default '{}', verified boolean default false,
                                 source_url text default null, episode_id uuid default null,
                                 role public.quote_role default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.quotes (text, author, source, context, questions, topics, verified, source_url)
  values (add_quote.quote, add_quote.author, add_quote.source, add_quote.context, coalesce(add_quote.questions, '{}'),
          coalesce(add_quote.topics, '{}'), coalesce(add_quote.verified, false), add_quote.source_url)
  returning id into new_id;
  if add_quote.episode_id is not null then
    update public.episodes e
       set quote_id = new_id, quote_role = coalesce(add_quote.role, e.quote_role)
     where e.id = add_quote.episode_id;
  end if;
  return new_id;
end;
$$;

revoke execute on function public.next_quote(uuid), public.swap_quote(uuid),
  public.add_quote(text, text, text, text, text[], text[], boolean, text, uuid, public.quote_role) from public, anon;
grant execute on function public.next_quote(uuid), public.swap_quote(uuid),
  public.add_quote(text, text, text, text, text[], text[], boolean, text, uuid, public.quote_role) to authenticated;

/** The bank with usage: which episodes used each quote. */
create view public.quote_cards
with (security_invoker = true)
as
select q.*,
       coalesce(p.display_name, 'Producer') as added_by_name,
       coalesce(u.used_count, 0) as used_count,
       coalesce(u.used_in, '{}') as used_in,
       u.last_used
from public.quotes q
left join public.profiles p on p.id = q.added_by
left join lateral (
  select count(*)::integer as used_count,
         array_agg(e.title order by e.recording_date desc nulls last) as used_in,
         max(e.recording_date) as last_used
  from public.episodes e where e.quote_id = q.id
) u on true;
grant select on public.quote_cards to authenticated;

-- Starter bank: public-domain quotes whose wording and attribution are checked against the cited source.
insert into public.quotes (text, author, source, source_url, context, questions, topics, verified) values
  ('It is not the critic who counts; not the man who points out how the strong man stumbles, or where the doer of deeds could have done them better. The credit belongs to the man who is actually in the arena, whose face is marred by dust and sweat and blood; who strives valiantly; who errs, who comes short again and again, because there is no effort without error and shortcoming; but who does actually strive to do the deeds; who knows great enthusiasms, the great devotions; who spends himself in a worthy cause; who at the best knows in the end the triumph of high achievement, and who at the worst, if he fails, at least fails while daring greatly, so that his place shall never be with those cold and timid souls who neither know victory nor defeat.',
   'Theodore Roosevelt', '"Citizenship in a Republic", address at the Sorbonne, Paris, 23 April 1910', null,
   'Roosevelt gave the speech a year after leaving the presidency. The passage is known as "The Man in the Arena".',
   array['Whose criticism have you given too much weight to?', 'Where are you staying out of the arena because you might fail?'], '{motivation,history}', true),
  ('Far and away the best prize that life offers is the chance to work hard at work worth doing.',
   'Theodore Roosevelt', 'Labor Day address, New York State Fair, Syracuse, 7 September 1903', null,
   'Said to a crowd of working men and farmers about the dignity of labour.',
   array['What work in your life is worth doing, even when it''s hard?', 'Is hard work a burden or a prize?'], '{motivation,history}', true),
  ('In the morning when thou risest unwillingly, let this thought be present—I am rising to the work of a human being.',
   'Marcus Aurelius', 'Meditations 5.1 (George Long translation, 1862)', null,
   'Written by a Roman emperor in a private notebook he never meant to publish.',
   array['What gets you out of bed on the hard mornings?', 'What is "the work of a human being" for a husband and father?'], '{philosophy,motivation}', true),
  ('No longer talk at all about the kind of man that a good man ought to be, but be such.',
   'Marcus Aurelius', 'Meditations 10.16 (George Long translation, 1862)', null,
   'Often paraphrased as "Waste no more time arguing what a good man should be. Be one."',
   array['Where do we talk about being good men more than we act like it?', 'What''s one thing you''d do this week if you stopped talking about it?'], '{philosophy,motivation}', true),
  ('Nothing, Lucilius, is ours, except time.',
   'Seneca', 'Moral Letters to Lucilius, Letter 1 (Richard M. Gummere translation, 1917)', null,
   'The opening of Seneca''s first letter to his friend Lucilius, on not wasting time.',
   array['Where does your time actually go in a week?', 'What would you stop doing if time were the only thing you owned?'], '{philosophy,motivation}', true),
  ('Iron sharpeneth iron; so a man sharpeneth the countenance of his friend.',
   'Proverbs 27:17', 'King James Version (1611)', null,
   'A proverb about friendship that makes men better, not just comfortable.',
   array['Who sharpens you, and who do you sharpen?', 'Do we have friendships that would tell us the truth?'], '{religion,motivation}', true),
  ('Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.',
   'Joshua 1:9', 'King James Version (1611)', null,
   'Spoken to Joshua as he takes over leadership from Moses.',
   array['What would you attempt if fear weren''t in the way?', 'Is courage a feeling or a decision?'], '{religion,motivation}', true),
  ('Watch ye, stand fast in the faith, quit you like men, be strong.',
   '1 Corinthians 16:13', 'King James Version (1611)', null,
   '"Quit you like men" means "act like men"; Paul''s closing charge to the church at Corinth.',
   array['What does "act like men" mean today, and what doesn''t it mean?', 'Where do you need to stand fast right now?'], '{religion,motivation}', true),
  ('He hath shewed thee, O man, what is good; and what doth the LORD require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?',
   'Micah 6:8', 'King James Version (1611)', null,
   'The prophet sums up what God asks of a person in three lines.',
   array['Which of the three is hardest for you: justice, mercy or humility?', 'Why does it say love mercy, not just show it?'], '{religion,philosophy}', true),
  ('For a just man falleth seven times, and riseth up again: but the wicked shall fall into mischief.',
   'Proverbs 24:16', 'King James Version (1611)', null,
   'The righteous man isn''t the one who never falls, but the one who gets back up.',
   array['What''s a time you fell and got back up?', 'What helps a man get back up instead of staying down?'], '{religion,motivation}', true),
  ('And whatsoever ye do, do it heartily, as to the Lord, and not unto men.',
   'Colossians 3:23', 'King James Version (1611)', null,
   'Paul''s instruction about ordinary work, originally addressed to servants.',
   array['Would your work change if your boss weren''t the audience?', 'What job do you do half-heartedly?'], '{religion,motivation}', true),
  ('Whatsoever thy hand findeth to do, do it with thy might; for there is no work, nor device, nor knowledge, nor wisdom, in the grave, whither thou goest.',
   'Ecclesiastes 9:10', 'King James Version (1611)', null,
   'The Preacher''s case for giving full effort while you''re alive.',
   array['What are you putting off as if you had unlimited time?', 'Does remembering death make you work harder or give up?'], '{religion,philosophy}', true),
  ('And if one prevail against him, two shall withstand him; and a threefold cord is not quickly broken.',
   'Ecclesiastes 4:12', 'King James Version (1611)', null,
   'Often read at weddings; it''s about the strength of not going it alone.',
   array['Who''s in your three-strand cord?', 'Why do men try to carry everything alone?'], '{religion,dating-culture}', true),
  ('But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.',
   'Isaiah 40:31', 'King James Version (1611)', null,
   'A promise of renewed strength to people worn out by exile.',
   array['Where do you go when you''re running on empty?', 'What does waiting look like for a man who likes to act?'], '{religion,motivation}', true),
  ('I have fought a good fight, I have finished my course, I have kept the faith.',
   '2 Timothy 4:7', 'King James Version (1611)', null,
   'Paul, near the end of his life, looking back.',
   array['What would you want to be able to say at the end?', 'What''s the fight worth fighting in your life right now?'], '{religion,motivation}', true),
  ('And let us not be weary in well doing: for in due season we shall reap, if we faint not.',
   'Galatians 6:9', 'King James Version (1611)', null,
   'Encouragement to keep doing good when results are slow.',
   array['What good thing are you tired of doing because nothing seems to change?', 'How long are you willing to wait for a harvest?'], '{religion,motivation}', true),
  ('It is of the LORD''s mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness.',
   'Lamentations 3:22–23', 'King James Version (1611)', null,
   'Written amid the ruins of Jerusalem, the book''s turning point toward hope.',
   array['What does a fresh start every morning mean to you?', 'How do you find hope in a bad season?'], '{religion,motivation}', true),
  ('This is the day which the LORD hath made; we will rejoice and be glad in it.',
   'Psalm 118:24', 'King James Version (1611)', null,
   'A song of thanksgiving.',
   array['What''s worth being glad about today?', 'Is gratitude a feeling or a discipline?'], '{religion,motivation}', true),
  ('Train up a child in the way he should go: and when he is old, he will not depart from it.',
   'Proverbs 22:6', 'King James Version (1611)', null,
   'A proverb about the long reach of a father''s and mother''s training.',
   array['What did your father train into you, for better or worse?', 'What do you want your kids to carry when they''re old?'], '{religion,dating-culture}', true),
  ('I have learned that success is to be measured not so much by the position that one has reached in life as by the obstacles which he has overcome while trying to succeed.',
   'Booker T. Washington', 'Up from Slavery (1901), chapter II', null,
   'Washington was born into slavery and became the first head of the Tuskegee Institute.',
   array['How do you measure success?', 'What obstacle are you proudest of overcoming?'], '{motivation,history}', true),
  ('With malice toward none, with charity for all, with firmness in the right as God gives us to see the right, let us strive on to finish the work we are in, to bind up the nation''s wounds, to care for him who shall have borne the battle and for his widow and his orphan, to do all which may achieve and cherish a just and lasting peace among ourselves and with all nations.',
   'Abraham Lincoln', 'Second Inaugural Address, 4 March 1865', null,
   'Delivered weeks before the end of the Civil War and Lincoln''s assassination.',
   array['How do you stay firm in the right without malice toward the other side?', 'Who needs charity from you right now?'], '{history,politics}', true),
  ('Early to bed and early to rise, makes a man healthy, wealthy, and wise.',
   'Benjamin Franklin', 'Poor Richard''s Almanack (1735)', null,
   'Franklin published the almanac under the pen name Richard Saunders; spelling modernised here.',
   array['Is your evening setting up your morning, or wrecking it?', 'Which habit would change your health the most?'], '{motivation,working-out}', true),
  ('Lost time is never found again.',
   'Benjamin Franklin', 'The Way to Wealth (1758), quoting Poor Richard', null,
   'From Father Abraham''s speech on industry and thrift in Franklin''s essay.',
   array['Where are you losing the most time?', 'What would you do with one extra hour a day?'], '{motivation,personal-finance}', true),
  ('It is better to offer no excuse than a bad one.',
   'George Washington', 'Letter to Harriot Washington, 30 October 1791', null,
   'Advice from Washington to his teenage niece.',
   array['What excuse do you keep making?', 'Why is owning a failure better than explaining it?'], '{motivation,history}', true),
  ('Tyranny, like hell, is not easily conquered; yet we have this consolation with us, that the harder the conflict, the more glorious the triumph.',
   'Thomas Paine', 'The American Crisis, No. 1, 23 December 1776', null,
   'Washington had it read to his troops days before crossing the Delaware.',
   array['What hard fight are you in right now?', 'Does a harder fight make the win mean more?'], '{history,motivation}', true)
on conflict do nothing;

-- Planning episodes without a quote get one now (one at a time, so they don't share).
do $$
declare
  ep record;
begin
  for ep in select id from public.episodes where quote_id is null and status = 'planning' order by recording_date nulls last loop
    update public.episodes set quote_id = public.next_quote() where id = ep.id;
  end loop;
end;
$$;

-- The digest shows each episode's quote (or that one is needed).
create or replace function public.producer_digest(days integer default 3, per_topic integer default 4, only_topics text[] default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with recent as (
    select s.*,
           -- File each story under its first topic (or its first topic among only_topics).
           coalesce((select u.t from unnest(s.topics) with ordinality as u(t, n)
                     where producer_digest.only_topics is null or u.t = any(producer_digest.only_topics)
                     order by u.n limit 1), 'news') as topic,
           (s.outlet_count - 1) * 2 + s.discuss_count * 3 + s.more_count - s.not_count * 3
             + greatest(0, 2 - extract(epoch from now() - s.latest_at) / 86400.0)
             - case when s.read then 0.5 else 0 end as score
    from public.source_inbox s
    where s.latest_at > now() - make_interval(days => greatest(1, producer_digest.days))
      and not s.in_prep
      and (producer_digest.only_topics is null or s.topics && producer_digest.only_topics)
  ), ranked as (
    select r.*, row_number() over (partition by r.topic order by r.score desc, r.latest_at desc) as rn
    from recent r
  ), sections as (
    select r.topic,
           jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'title', r.title,
             'url', r.url,
             'type', case when r.media_type <> 'article' then r.media_type end,
             'min', case when r.duration_seconds > 0 then round(r.duration_seconds / 60.0) end,
             'views', r.views,
             'src', r.source,
             'date', to_char(coalesce(r.published_at, r.latest_at), 'YYYY-MM-DD'),
             'outlets', nullif(r.outlet_count, 1),
             'preview', left(r.preview, 160),
             'discuss', nullif(r.discuss_count, 0),
             'more', nullif(r.more_count, 0),
             'not', nullif(r.not_count, 0),
             'read', case when r.read then true end))
             order by r.score desc) as items
    from ranked r
    where r.rn <= greatest(1, producer_digest.per_topic)
    group by r.topic
  ), host_signal as (
    select p.id, p.display_name,
           (select coalesce(jsonb_agg(x.topic order by x.w desc), '[]') from (
              select t.topic, sum(t.w) as w from (
                select unnest(i.topics) as topic, 3 as w from public.item_highlights h join public.item_cards i on i.id = h.item_id
                 where h.user_id = p.id and h.created_at > now() - interval '90 days'
                union all
                select unnest(e.topics), 2 from public.source_feedback sf join public.feed_entries e on e.id = sf.entry_id
                 where sf.member_id = p.id and sf.kind in ('discuss', 'more_like_this') and sf.created_at > now() - interval '90 days'
                union all
                select unnest(e.topics), -2 from public.source_feedback sf join public.feed_entries e on e.id = sf.entry_id
                 where sf.member_id = p.id and sf.kind = 'not_interested' and sf.created_at > now() - interval '90 days'
              ) t group by t.topic having sum(t.w) > 0 order by w desc limit 3) x) as likes,
           (select coalesce(jsonb_agg(x.title), '[]') from (
              select e.title from public.source_feedback sf join public.feed_entries e on e.id = sf.entry_id
              where sf.member_id = p.id and sf.kind = 'more_like_this' order by sf.created_at desc limit 4) x) as more_like,
           (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('title', x.title, 'why', x.reason))), '[]') from (
              select e.title, sf.reason from public.source_feedback sf join public.feed_entries e on e.id = sf.entry_id
              where sf.member_id = p.id and sf.kind = 'not_interested' order by sf.created_at desc limit 4) x) as not_interested
    from public.profiles p
  )
  select jsonb_build_object(
    'window_days', greatest(1, producer_digest.days),
    'topics', coalesce((select jsonb_object_agg(s.topic, s.items) from sections s), '{}'),
    'this_week', coalesce((select jsonb_agg(i.title) from public.items i where i.status = 'this_week'), '[]'),
    'covered', coalesce((select jsonb_agg(x.title) from (
        select i.title from public.items i where i.status = 'used' and i.updated_at > now() - interval '45 days'
        order by i.updated_at desc limit 20) x), '[]'),
    'episodes', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'title', e.title, 'date', e.recording_date, 'status', e.status,
          'quote', case when q.id is not null then left(q.text, 140) || case when length(q.text) > 140 then '…' else '' end || ' (' || q.author || ')' end,
          'quote_role', case when q.id is not null then e.quote_role end,
          'needs_quote', case when q.id is null and e.status = 'planning' then true end))
        order by e.recording_date desc nulls last)
        from (select * from public.episodes order by recording_date desc nulls last limit 4) e
        left join public.quotes q on q.id = e.quote_id), '[]'),
    'hosts', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'name', h.display_name,
        'likes', nullif(h.likes, '[]'::jsonb),
        'more_like', nullif(h.more_like, '[]'::jsonb),
        'not_interested', nullif(h.not_interested, '[]'::jsonb)))) from host_signal h), '[]'),
    'open_research', (select count(*) from public.research_requests r where r.status in ('open', 'in_progress'))
  )
$$;
