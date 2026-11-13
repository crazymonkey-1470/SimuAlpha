// Web Push without dependencies: VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291 / RFC 8188).
// Uses only WebCrypto and fetch, so the same file runs in the Supabase Edge Function (Deno) and in the
// Node tests (worker/test/push.test.js), where it is checked against the http_ece library.

const te = new TextEncoder();

export const b64u = {
  enc(bytes) {
    let s = '';
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(ikm, salt, info, bits) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bits));
}

/** A new P-256 key pair for VAPID: { publicKey (base64url, uncompressed point), privateJwk }. */
export async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    publicKey: b64u.enc(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
}

/** Authorization header value for a push endpoint. vapid = { publicKey, privateJwk, subject }. */
export async function vapidAuthorization(endpoint, vapid, nowMs = Date.now()) {
  const header = b64u.enc(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.enc(te.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(nowMs / 1000) + 12 * 3600,
    sub: vapid.subject,
  })));
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u.enc(sig)}, k=${vapid.publicKey}`;
}

/**
 * Encrypt a payload for one subscription. Returns the request body (aes128gcm, one record).
 * sub = { p256dh, auth } (base64url, from PushSubscription.toJSON().keys).
 */
export async function encryptPayload(sub, payload) {
  const plain = typeof payload === 'string' ? te.encode(payload) : payload;
  if (plain.length > 3900) throw new Error('Push payload too large');
  const uaPublic = b64u.dec(sub.p256dh);
  const authSecret = b64u.dec(sub.auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('Invalid subscription keys');

  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  // RFC 8291 §3.4: combine the ECDH secret with the subscription's auth secret.
  const ikm = await hkdf(shared, authSecret, concat(te.encode('WebPush: info\0'), uaPublic, localPublic), 256);
  // RFC 8188 §2.2 / §2.3: content-encryption key and nonce from a random salt.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, te.encode('Content-Encoding: aes128gcm\0'), 128);
  const nonce = await hkdf(ikm, salt, te.encode('Content-Encoding: nonce\0'), 96);

  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 }, aes, concat(plain, new Uint8Array([2])))); // 0x02 = last record

  const header = new Uint8Array(16 + 4 + 1 + localPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);   // record size
  header[20] = localPublic.length;                    // key id = our public key
  header.set(localPublic, 21);
  return concat(header, cipher);
}

/** Hosts of real push services; anything else is refused, so a bad subscription can't make us call arbitrary sites. */
export function isPushHost(endpoint) {
  let host;
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:') return false;
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === 'fcm.googleapis.com' || host.endsWith('.push.apple.com') || host.endsWith('.push.services.mozilla.com')
    || host.endsWith('.notify.windows.com');
}

/** Send one notification. Returns { status, error? }; status 0 means it was never sent. */
export async function sendPush(sub, message, vapid, { ttl = 86400, fetchImpl = fetch } = {}) {
  try {
    if (!isPushHost(sub.endpoint)) return { status: 0, error: 'Not a known push service' };
    const body = await encryptPayload(sub, JSON.stringify(message));
    const res = await fetchImpl(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(sub.endpoint, vapid),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: 'normal',
      },
      body,
    });
    const error = res.status >= 200 && res.status < 300 ? undefined : (await res.text().catch(() => '')).slice(0, 200) || `HTTP ${res.status}`;
    return { status: res.status, error };
  } catch (e) {
    return { status: 0, error: String(e?.message ?? e).slice(0, 200) };
  }
}
