-- True Adam prep room: read-only health check. Paste into Supabase → SQL Editor → Run.
-- Changes nothing. Returns one JSON report; copy the result cell and send it to Claude.
select jsonb_pretty(jsonb_build_object(
  'checked_at', now(),
  'worker', public.ingest_status(),
  'worker_minutes_since_last_run',
      round(extract(epoch from now() - (select worker_last_run_at from public.ingest_state)) / 60),
  'sources', (select jsonb_build_object(
      'total', count(*),
      'active', count(*) filter (where active),
      'with_errors', count(*) filter (where active and last_error is not null),
      'month_backfill_done', count(*) filter (where active and backfilled_at is not null),
      'month_backfill_pending', count(*) filter (where active and backfilled_at is null),
      'not_fetched_in_2h', count(*) filter (where active and (last_fetched_at is null or last_fetched_at < now() - interval '2 hours')))
    from public.feeds),
  'source_errors', (select coalesce(jsonb_agg(jsonb_build_object('source', name, 'error', last_error, 'at', last_fetched_at)
      order by name), '[]') from public.feeds where active and last_error is not null),
  'headlines', (select jsonb_build_object(
      'total', count(*),
      'stories', (select count(*) from public.source_inbox),
      'added_last_hour', count(*) filter (where created_at > now() - interval '1 hour'),
      'added_last_24h', count(*) filter (where created_at > now() - interval '24 hours'),
      'oldest', min(published_at)::date,
      'newest', max(published_at))
    from public.feed_entries),
  'headlines_per_day_last_10', (select jsonb_object_agg(d, n order by d desc) from (
      select published_at::date d, count(*) n from public.feed_entries
      where published_at > now() - interval '10 days' group by 1) x),
  'stories_by_topic', (select jsonb_object_agg(t, n order by n desc) from (
      select topics[1] t, count(*) n from public.source_inbox group by 1) x),
  'prep_room', jsonb_build_object(
      'items', (select count(*) from public.items),
      'this_week', (select count(*) from public.items where status = 'this_week'),
      'inbox', (select count(*) from public.items where status = 'inbox'),
      'comments', (select count(*) from public.comments),
      'stars', (select count(*) from public.item_highlights),
      'research_open', (select count(*) from public.research_requests where status in ('open', 'in_progress')),
      'research_answered', (select count(*) from public.research_requests where status = 'done')),
  'episodes', (select coalesce(jsonb_agg(jsonb_build_object(
        'title', e.title, 'date', e.recording_date, 'status', e.status,
        'quote', q.author, 'quote_role', e.quote_role) order by e.recording_date nulls last), '[]')
      from public.episodes e left join public.quotes q on q.id = e.quote_id),
  'grok', jsonb_build_object(
      'memories', (select count(*) from public.memories where invalid_at is null),
      'conversations', (select count(*) from public.conversations),
      'verified_reads', (select count(*) from public.article_reads),
      'crew_feedback', (select count(*) from public.source_feedback),
      'quotes_in_bank', (select count(*) from public.quotes)),
  'crew', (select jsonb_agg(jsonb_build_object('name', p.display_name, 'role', p.role,
        'last_sign_in', u.last_sign_in_at) order by p.display_name)
      from public.profiles p left join auth.users u on u.id = p.id),
  'scheduled_jobs_last_24h', (select jsonb_object_agg(j.jobname, jsonb_build_object('runs', n, 'failed', f)) from (
      select j.jobname, count(*) n, count(*) filter (where d.status <> 'succeeded') f
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
      where d.start_time > now() - interval '24 hours' group by 1) j),
  'database_size', pg_size_pretty(pg_database_size(current_database())),
  'latest_migration', (select max(version) from supabase_migrations.schema_migrations)
)) as report;
