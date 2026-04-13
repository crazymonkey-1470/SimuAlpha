/**
 * Vitest setup — provide dummy env vars so Supabase client initializes.
 * With globals: true, vi/describe/it/expect are available as globals.
 */

// Set dummy env vars before any module loads
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
process.env.NODE_ENV = 'test';
