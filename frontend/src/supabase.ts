import { createClient, type PostgrestError } from '@supabase/supabase-js';

const url = import.meta.env.VITE_TRUEADAM_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_TRUEADAM_SUPABASE_KEY as string | undefined;

function isServerKey(k: string): boolean {
  if (k.startsWith('sb_secret_')) return true;
  try {
    const payload = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

export const configError: string | null =
  !url || !key
    ? 'This build has no Supabase settings. Set VITE_TRUEADAM_SUPABASE_URL and VITE_TRUEADAM_SUPABASE_KEY (see README).'
    : isServerKey(key)
      ? 'Refusing to start: VITE_TRUEADAM_SUPABASE_KEY is a secret/service_role key. Use the publishable (anon) key.'
      : null;

export const supabase = createClient(url ?? 'http://invalid.localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
});

const FRIENDLY: [RegExp, string][] = [
  [/items_url_check/, 'That link doesn’t look like a web address. Paste the full link (https://…).'],
  [/items_title_check|title.*not-null/, 'Give it a title.'],
  [/research_requests_request_check/, 'Write what you want Grok to look into.'],
  [/row-level security|permission denied/, 'You don’t have permission to do that. Ask the producer if this seems wrong.'],
  [/JWT expired|invalid JWT|refresh_token/i, 'Your session expired. Reload the page and sign in again.'],
  [/Failed to fetch|NetworkError|Load failed/i, 'Couldn’t reach the server. Check your connection and try again.'],
];

/** Human-readable message for a PostgREST / auth error. */
export function errorText(error: PostgrestError | { message: string } | null | undefined): string {
  if (!error) return '';
  const e = error as PostgrestError;
  const friendly = FRIENDLY.find(([re]) => re.test(e.message));
  if (friendly) return friendly[1];
  return e.hint ? `${e.message} ${e.hint}` : e.message;
}
