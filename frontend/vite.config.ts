import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Refuse to bundle a server-side key into the public site.
function assertPublicKey(key: string | undefined) {
  if (!key) return;
  let role: string | undefined;
  try {
    role = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()).role;
  } catch {
    /* not a JWT (e.g. sb_publishable_...) */
  }
  if (key.startsWith('sb_secret_') || role === 'service_role') {
    throw new Error('VITE_TRUEADAM_SUPABASE_KEY is a secret/service_role key. Use the publishable (or anon) key.');
  }
}

export default defineConfig(({ mode }) => {
  assertPublicKey(loadEnv(mode, process.cwd(), 'VITE_').VITE_TRUEADAM_SUPABASE_KEY);
  return { base: './', plugins: [react()], build: { chunkSizeWarningLimit: 700 } };
});
