// The push sender's crypto (supabase/functions/send-push/push-core.js), checked against independent code:
// payloads are decrypted with the http_ece library (what a browser's push service does), and the VAPID
// token is verified with Node's own crypto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ece from 'http_ece';
import { b64u, encryptPayload, generateVapidKeys, isPushHost, sendPush, vapidAuthorization } from '../../supabase/functions/send-push/push-core.js';

function phone() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, sub: { endpoint: 'https://web.push.apple.com/QK-test', p256dh: b64u.enc(ecdh.getPublicKey()), auth: b64u.enc(auth) } };
}

test('push payload: what we encrypt, a phone can decrypt (aes128gcm, RFC 8291)', async () => {
  for (const text of ['{"title":"True Adam","body":"Stew mentioned you"}', 'x', 'Ünïcödé “quotes” — and a long body '.repeat(60)]) {
    const p = phone();
    const body = await encryptPayload(p.sub, text);
    assert.equal(body.length, 16 + 4 + 1 + 65 + Buffer.byteLength(text) + 1 + 16, 'header + ciphertext + padding byte + tag');
    const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: p.ecdh, authSecret: p.sub.auth });
    assert.equal(plain.toString('utf8'), text);
  }
  const a = phone();
  const one = await encryptPayload(a.sub, 'same');
  const two = await encryptPayload(a.sub, 'same');
  assert.notDeepEqual(one, two, 'fresh key and salt every time');
  const other = phone();
  assert.throws(() => ece.decrypt(Buffer.from(one), { version: 'aes128gcm', privateKey: other.ecdh, authSecret: other.sub.auth }), 'another phone cannot read it');
  await assert.rejects(encryptPayload({ p256dh: 'AAAA', auth: 'AAAA' }, 'x'), /Invalid subscription keys/);
  await assert.rejects(encryptPayload(a.sub, 'x'.repeat(5000)), /too large/);
});

test('VAPID: a signed ES256 token for the push service, verifiable with the public key', async () => {
  const keys = await generateVapidKeys();
  const raw = b64u.dec(keys.publicKey);
  assert.equal(raw.length, 65);
  assert.equal(raw[0], 4, 'uncompressed point');
  const now = Date.parse('2026-11-11T12:00:00Z');
  const value = await vapidAuthorization('https://web.push.apple.com/QK-abc/def', { ...keys, subject: 'https://simualpha.com' }, now);
  const m = value.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);
  assert.ok(m, value.slice(0, 40));
  assert.equal(m[4], keys.publicKey);
  assert.deepEqual(JSON.parse(Buffer.from(b64u.dec(m[1])).toString()), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(Buffer.from(b64u.dec(m[2])).toString());
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.sub, 'https://simualpha.com');
  assert.ok(claims.exp - now / 1000 > 3600 && claims.exp - now / 1000 <= 24 * 3600, 'expires within a day');
  const publicKey = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64u.enc(raw.slice(1, 33)), y: b64u.enc(raw.slice(33)) } });
  const ok = crypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(b64u.dec(m[3])));
  assert.equal(ok, true, 'signature verifies');
  const tampered = crypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}x`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(b64u.dec(m[3])));
  assert.equal(tampered, false);
});

test('sendPush: right headers, results passed back, and only real push services are ever called', async () => {
  const keys = { ...(await generateVapidKeys()), subject: 'https://simualpha.com' };
  const p = phone();
  let seen;
  const ok = await sendPush(p.sub, { title: 'T', body: 'B', url: '#/inbox' }, keys, {
    fetchImpl: async (url, init) => ((seen = { url, init }), { status: 201, text: async () => '' }),
  });
  assert.deepEqual(ok, { status: 201, error: undefined });
  assert.equal(seen.url, p.sub.endpoint);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(seen.init.headers.TTL, '86400');
  assert.match(seen.init.headers.Authorization, /^vapid t=.+, k=.+$/);
  const plain = ece.decrypt(Buffer.from(seen.init.body), { version: 'aes128gcm', privateKey: p.ecdh, authSecret: p.sub.auth });
  assert.deepEqual(JSON.parse(plain.toString()), { title: 'T', body: 'B', url: '#/inbox' });

  const gone = await sendPush(p.sub, { title: 'T' }, keys, { fetchImpl: async () => ({ status: 410, text: async () => 'Gone' }) });
  assert.deepEqual(gone, { status: 410, error: 'Gone' });
  const down = await sendPush(p.sub, { title: 'T' }, keys, { fetchImpl: async () => { throw new Error('network down'); } });
  assert.deepEqual(down, { status: 0, error: 'network down' });

  let called = false;
  const evil = await sendPush({ ...p.sub, endpoint: 'https://internal.example.org/admin' }, { title: 'T' }, keys, { fetchImpl: async () => ((called = true), { status: 200, text: async () => '' }) });
  assert.equal(evil.status, 0);
  assert.equal(called, false, 'unknown hosts are never contacted');
  for (const [u, want] of [
    ['https://web.push.apple.com/abc', true], ['https://fcm.googleapis.com/fcm/send/x', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/x', true], ['https://db5p.notify.windows.com/w/?token=x', true],
    ['http://web.push.apple.com/abc', false], ['https://push.apple.com.evil.example/abc', false], ['https://evilfcm.googleapis.com/x', false], ['not a url', false],
  ]) assert.equal(isPushHost(u), want, u);
});
