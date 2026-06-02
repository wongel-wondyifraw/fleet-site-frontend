"use client";

import {
  getVapidPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
} from "@/lib/api/notifications";

const PUSH_ENABLED_KEY = "fleetsite.push.enabled";

// Hard ceiling on how long we wait for `navigator.serviceWorker.ready`.
//
// That promise is fulfilled when *any* SW reaches the activated state. When
// no SW is registered (dev builds — see ServiceWorkerRegister — or regular
// iOS Safari outside an installed PWA) it never resolves. Without this
// timeout the settings toggle's enable/disable click handler would hang
// indefinitely and the UI would never reflect the user's intent.
const SW_READY_TIMEOUT_MS = 3000;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function readyWithTimeout(
  ms: number,
): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  } catch {
    return null;
  }
}

export function isPushEnabledLocally(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PUSH_ENABLED_KEY) === "true";
}

// True when this browser is even capable of subscribing for web push. The
// settings panel uses this to decide whether to show the iPhone install
// hint instead of attempting a subscription that will silently never fire.
export function isPushSupportedHere(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  if (!("Notification" in window)) return false;
  return true;
}

export async function enablePush(): Promise<boolean> {
  if (!isPushSupportedHere()) return false;

  const registration = await readyWithTimeout(SW_READY_TIMEOUT_MS);
  if (!registration) return false;

  const { publicKey } = await getVapidPublicKey();
  if (!publicKey) return false;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as
          BufferSource,
      });
    } catch {
      // subscribe() rejects when the user denies the OS permission prompt
      // or the browser blocks the request (e.g. third-party context). Don't
      // throw — let the caller move on without push.
      return false;
    }
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  await registerPushSubscription({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PUSH_ENABLED_KEY, "true");
  }
  return true;
}

export async function disablePush(): Promise<void> {
  if (typeof window === "undefined") return;
  // Always clear the local intent first. That way the settings panel
  // reads "push off here" even if the SW never readies (dev / iOS-Safari)
  // and the rest of this function bails out.
  window.localStorage.setItem(PUSH_ENABLED_KEY, "false");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const registration = await readyWithTimeout(SW_READY_TIMEOUT_MS);
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  try {
    await subscription.unsubscribe();
  } catch {
    // Best-effort — still tell the server to forget the endpoint.
  }
  try {
    await unregisterPushSubscription(endpoint);
  } catch {
    /* best effort */
  }
}
