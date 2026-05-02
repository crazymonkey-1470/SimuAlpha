import { createClient } from '@supabase/supabase-js';

// Fail loudly at module-load time when the build is missing its
// Supabase env vars. Without this, every component that calls
// supabase.from(...) gets a confusing 401/404 from a default client
// pointed at "undefined", and dev:debug eats hours.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must both be set in the build env. ' +
      'See frontend/.env.example.',
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabase;
