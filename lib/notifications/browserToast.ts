"use client";

import type { NotificationItem } from "@/lib/notifications/data";

export async function ensurePermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

export function showInTab(
  item: NotificationItem,
  osToastPerKind: Record<string, boolean> | undefined,
): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (document.visibilityState !== "hidden") return;
  if (Notification.permission !== "granted") return;
  if (osToastPerKind && osToastPerKind[item.kind] === false) return;

  const notif = new Notification(item.title, {
    body: item.message,
    icon: "/icon-192.png",
    tag: item.id,
    data: { href: item.href ?? "/notifications" },
  });
  notif.onclick = () => {
    window.focus();
    const href = item.href ?? "/notifications";
    if (href) window.location.href = href;
  };
}
