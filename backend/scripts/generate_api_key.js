/**
 * API Key Generator — SimuAlpha
 * Usage: node scripts/generate_api_key.js "Key Name" scope1,scope2
 * Scopes: read, write, admin, agent
 */

require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateKey(name, scopes, rateLimitPerMinute = 60) {
  const raw = `sa_live_${crypto.randomBytes(24).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.substring(0, 8);

  const { data, error } = await supabase
    .from('api_keys')
    .insert({ key_hash: hash, key_prefix: prefix, name, scopes, rate_limit_per_minute: rateLimitPerMinute })
    .select()
    .single();

  if (error) throw error;

  console.log('='.repeat(60));
  console.log('API KEY GENERATED — SAVE THIS, IT CANNOT BE RECOVERED');
  console.log('='.repeat(60));
  console.log(`Key:    ${raw}`);
  console.log(`Name:   ${name}`);
  console.log(`Scopes: ${scopes.join(', ')}`);
  console.log(`ID:     ${data.id}`);
  console.log('='.repeat(60));
  return raw;
}

const [name, scopeStr] = process.argv.slice(2);
if (!name || !scopeStr) {
  console.log('Usage: node scripts/generate_api_key.js "Key Name" scope1,scope2');
  console.log('Scopes: read, write, admin, agent');
  process.exit(1);
}
generateKey(name, scopeStr.split(',')).catch(e => { console.error(e.message); process.exit(1); });
