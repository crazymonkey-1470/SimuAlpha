// Sends waiting notifications to the crew's subscribed phones (Web Push).
// Woken by the database (a trigger on new notifications) with a shared secret; reads the outbox and
// reports results through two token-checked database functions. Holds no admin key.
//
// Secrets: PUSH_SECRET, VAPID_PUBLIC, VAPID_PRIVATE_JWK, VAPID_SUBJECT, SB_URL, SB_KEY (publishable key)
import { sendPush } from './push-core.js';

const env = (k: string) => Deno.env.get(k) ?? '';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function rpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${env('SB_URL').replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: env('SB_KEY'), Authorization: `Bearer ${env('SB_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} failed (${res.status}): ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const secret = env('PUSH_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  let only: string | null = null;
  try {
    only = (await req.json())?.notification_id ?? null;
  } catch {
    // no body: send everything that is waiting
  }

  try {
    const vapid = {
      publicKey: env('VAPID_PUBLIC'),
      privateJwk: JSON.parse(env('VAPID_PRIVATE_JWK') || '{}'),
      subject: env('VAPID_SUBJECT') || 'https://simualpha.com',
    };
    const rows = (await rpc('push_outbox', { secret, only_id: only })) ?? [];
    const results = [];
    for (const r of rows) {
      const res = await sendPush(
        { endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth_key },
        { title: r.title, body: String(r.body ?? '').slice(0, 300), url: r.url ?? '#/inbox', tag: r.notification_id },
        vapid,
      );
      results.push({ notification_id: r.notification_id, subscription_id: r.subscription_id, status: res.status, error: res.error });
    }
    const delivered = rows.length ? await rpc('push_result', { secret, results }) : 0;
    return json({ waiting: rows.length, delivered });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});
