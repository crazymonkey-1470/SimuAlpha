import { useEffect, useState } from 'react';
import { errorText, supabase } from '../supabase';

const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
const isIOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

function keyBytes(b64url: string): Uint8Array {
  const s = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Keep the notification worker registered on phones that already said yes. */
export function registerPushWorker() {
  if (supported && Notification.permission === 'granted') navigator.serviceWorker.register('sw.js').catch(() => {});
}

/** Account → Notifications: turn phone notifications on or off for this device, and send a test. */
export default function PushSettings() {
  const [state, setState] = useState<'loading' | 'unsupported' | 'not-set-up' | 'off' | 'on' | 'blocked'>('loading');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!supported) return setState('unsupported');
      const { data } = await supabase.rpc('push_public_key');
      if (!data) return setState('not-set-up');
      setPublicKey(data as string);
      if (Notification.permission === 'denied') return setState('blocked');
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);

  async function turnOn() {
    if (!publicKey) return;
    setBusy(true);
    setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return setMsg({ ok: false, text: 'Notifications weren’t allowed.' });
      }
      const reg = await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }));
      const json = sub.toJSON();
      const { error } = await supabase.rpc('save_push_subscription', {
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth_key: json.keys?.auth,
        device: navigator.userAgent.slice(0, 200),
      });
      if (error) throw new Error(errorText(error));
      setState('on');
      setMsg({ ok: true, text: 'Notifications are on for this device.' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || 'Couldn’t turn notifications on.' });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
      setMsg({ ok: true, text: 'Notifications are off for this device.' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const { error } = await supabase.rpc('send_test_notification');
    setBusy(false);
    setMsg(error ? { ok: false, text: errorText(error) } : { ok: true, text: 'Sent. It should arrive within a few seconds (it’s also in your inbox).' });
  }

  return (
    <section className="push-settings">
      <h2>
        <span>Notifications</span>
      </h2>
      <p className="hint">
        Get a note on this device when someone @mentions you, when Grok answers your question, and once a week with
        what the next episode still needs.
      </p>
      {state === 'loading' && <p className="muted">Checking…</p>}
      {state === 'unsupported' &&
        (isIOS && !standalone ? (
          <p className="warn">
            On iPhone, notifications only work from the Home Screen app: in Safari tap <b>Share</b>, then{' '}
            <b>Add to Home Screen</b>, open True Adam from the new icon, and come back to this page.
          </p>
        ) : (
          <p className="muted">This browser can’t show notifications. Your inbox on the site still gets everything.</p>
        ))}
      {state === 'not-set-up' && <p className="muted">Phone notifications aren’t switched on for the site yet. Your inbox still gets everything.</p>}
      {state === 'blocked' && (
        <p className="warn">Notifications are blocked for this site in your device settings. Allow them there, then reload this page.</p>
      )}
      {(state === 'off' || state === 'on') && (
        <div className="actions">
          {state === 'off' ? (
            <button className="primary" disabled={busy} onClick={turnOn}>
              Turn on notifications
            </button>
          ) : (
            <>
              <button disabled={busy} onClick={test}>
                Send me a test
              </button>
              <button disabled={busy} onClick={turnOff}>
                Turn off on this device
              </button>
            </>
          )}
        </div>
      )}
      {msg && <p className={msg.ok ? 'success' : 'error'}>{msg.text}</p>}
    </section>
  );
}
