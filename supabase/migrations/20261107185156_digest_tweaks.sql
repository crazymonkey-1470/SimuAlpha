-- producer_digest tweaks after testing on real feeds:
--   * each story carries its url (what Grok needs to read it or call get_read/save_read) instead of an id
--   * optional only_topics filter, e.g. producer_digest(only_topics => array['religion','history'])
-- Also records the corrected Institute for Family Studies feed URL.

update public.feeds set url = 'https://ifstudies.org/blog/rss'
where url = 'https://ifstudies.org/blog/feed';

drop function public.producer_digest(integer, integer);

create function public.producer_digest(days integer default 3, per_topic integer default 4, only_topics text[] default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with recent as (
    select s.*,
           coalesce(s.topics[1], 'news') as topic,
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
    'episodes', coalesce((select jsonb_agg(jsonb_build_object('title', e.title, 'date', e.recording_date, 'status', e.status)
        order by e.recording_date desc nulls last)
        from (select * from public.episodes order by recording_date desc nulls last limit 4) e), '[]'),
    'hosts', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'name', h.display_name,
        'likes', nullif(h.likes, '[]'::jsonb),
        'more_like', nullif(h.more_like, '[]'::jsonb),
        'not_interested', nullif(h.not_interested, '[]'::jsonb)))) from host_signal h), '[]'),
    'open_research', (select count(*) from public.research_requests r where r.status in ('open', 'in_progress'))
  )
$$;

revoke execute on function public.producer_digest(integer, integer, text[]) from public, anon;
grant execute on function public.producer_digest(integer, integer, text[]) to authenticated;
