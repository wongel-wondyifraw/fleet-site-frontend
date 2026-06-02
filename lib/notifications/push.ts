"use client";

import {
  getVapidPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
} from "@/lib/api/notifications";

const PUSH_ENABLED_KEY = "fleetsite.push.enabled";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushEnabledLocally(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PUSH_ENABLED_KEY) === "true";
}

export async function enablePush(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await getVapidPublicKey();
  if (!publicKey) return false;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as
        BufferSource,
    });
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  await registerPushSubscription({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  window.localStorage.setItem(PUSH_ENABLED_KEY, "true");
  return true;
}

export async function disablePush(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    window.localStorage.setItem(PUSH_ENABLED_KEY, "false");
    return;
  }
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await unregisterPushSubscription(endpoint);
  window.localStorage.setItem(PUSH_ENABLED_KEY, "false");
}
