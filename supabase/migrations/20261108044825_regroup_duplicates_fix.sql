-- Follow-up to overnight_debug_fixes. Its regroup loop used a column alias named "merge"; PL/pgSQL
-- then read "merge into r" as SQL (MERGE INTO), so "select ... into r" created a stray table public.r
-- (one row of story ids, no user data) and nothing was regrouped. Drop that table and regroup properly,
-- as a reusable function.

drop table if exists public.r;

/** Join stories where the same source repeated the exact headline within 3 days. Producer or SQL only.
    Only story ids change; no headlines are removed. Returns how many stories were folded in. */
create function public.regroup_duplicate_stories()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  pair  record;
  n     integer := 0;
begin
  if auth.uid() is not null and (select public.my_role())::text is distinct from 'producer' then
    raise exception 'Only the producer can regroup stories' using errcode = '42501';
  end if;
  loop
    select a.story_id as keep_story, b.story_id as fold_story
      into pair
    from public.feed_entries a
    join public.feed_entries b
      on b.feed_id = a.feed_id and b.title_key = a.title_key and b.story_id <> a.story_id
    where length(a.title_key) > 12
      and abs(extract(epoch from coalesce(a.published_at, a.created_at) - coalesce(b.published_at, b.created_at))) <= 3 * 86400
      and (coalesce(a.published_at, a.created_at), a.id) < (coalesce(b.published_at, b.created_at), b.id)
    limit 1;
    exit when not found;
    update public.feed_entries set story_id = pair.keep_story where story_id = pair.fold_story;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.regroup_duplicate_stories() from public, anon;
grant execute on function public.regroup_duplicate_stories() to authenticated;

select public.regroup_duplicate_stories();
