-- worker_sources returns a column called "id", so the bare "where id" from the previous migration
-- was ambiguous inside the function. Qualify it with a table alias.

create or replace function public.worker_sources(token text)
returns table (id uuid, name text, kind text, url text, input_url text, resolved boolean,
               etag text, last_modified text, topics text[])
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.ingest_token_ok(worker_sources.token) then
    raise exception 'Invalid or revoked ingest token' using errcode = '28000';
  end if;
  update public.ingest_state s set worker_last_run_at = now() where s.id;   -- alias: "id" is also an output column
  return query
    select f.id, f.name, f.kind, f.url, f.input_url, f.resolved, f.etag, f.last_modified, f.topics
    from public.feeds f where f.active order by f.last_fetched_at nulls first;
end;
$$;
