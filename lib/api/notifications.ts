import { apiRequest } from "@/lib/api/client";
import { getStoredToken } from "@/lib/auth/storage";
import type {
  NotificationItem,
  NotificationKind,
} from "@/lib/notifications/data";

export interface NotificationsPageResponse {
  data: NotificationItem[];
  nextCursor: string | null;
}

export interface NotificationPreferences {
  userId: string;
  inAppPerKind: Record<string, boolean>;
  osToastPerKind: Record<string, boolean>;
  webPushPerKind: Record<string, boolean>;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface NotificationStreamPayload {
  type: "notification.created" | "notification.updated" | "heartbeat";
  item?: NotificationItem;
  unreadCount?: number;
  ts?: string;
}

export async function listNotifications(params: {
  cursor?: string;
  limit?: number;
  unread?: boolean;
  kind?: NotificationKind;
} = {}): Promise<NotificationsPageResponse> {
  const sp = new URLSearchParams();
  if (params.cursor) sp.set("cursor", params.cursor);
  if (params.limit) sp.set("limit", String(params.limit));
  if (typeof params.unread === "boolean") sp.set("unread", String(params.unread));
  if (params.kind) sp.set("kind", params.kind);
  const query = sp.size ? `?${sp.toString()}` : "";
  return apiRequest<NotificationsPageResponse>(`/notifications${query}`);
}

export async function getUnreadCount(): Promise<number> {
  const res = await apiRequest<{ unreadCount: number }>("/notifications/unread-count");
  return res.unreadCount;
}

export function markRead(id: string): Promise<NotificationItem> {
  return apiRequest<NotificationItem>(`/notifications/${id}/read`, {
    method: "PATCH",
    body: { read: true },
  });
}

export function markUnread(id: string): Promise<NotificationItem> {
  return apiRequest<NotificationItem>(`/notifications/${id}/read`, {
    method: "PATCH",
    body: { read: false },
  });
}

export function markAllRead(): Promise<void> {
  return apiRequest<void>("/notifications/read-all", { method: "PATCH" });
}

export function removeNotification(id: string): Promise<void> {
  return apiRequest<void>(`/notifications/${id}`, { method: "DELETE" });
}

export function clearAllNotifications(): Promise<void> {
  return apiRequest<void>("/notifications", { method: "DELETE" });
}

export function getVapidPublicKey(): Promise<{ publicKey: string }> {
  return apiRequest<{ publicKey: string }>("/notifications/vapid-public-key");
}

export function registerPushSubscription(
  sub: PushSubscriptionPayload,
): Promise<void> {
  return apiRequest<void>("/notifications/subscriptions", {
    method: "POST",
    body: sub,
  });
}

export function unregisterPushSubscription(endpoint: string): Promise<void> {
  return apiRequest<void>("/notifications/subscriptions", {
    method: "DELETE",
    body: { endpoint },
  });
}

export function getNotificationPreferences(): Promise<NotificationPreferences> {
  return apiRequest<NotificationPreferences>("/notifications/preferences");
}

export function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return apiRequest<NotificationPreferences>("/notifications/preferences", {
    method: "PATCH",
    body: patch,
  });
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:3001/api`
    : "http://localhost:3001/api");

export async function openNotificationsStream(
  onEvent: (evt: NotificationStreamPayload) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = getStoredToken();
  if (!token) return;

  let backoff = 1000;
  while (!signal?.aborted) {
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/stream`, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        signal,
      });
      if (!res.ok || !res.body) throw new Error(`SSE failed: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!signal?.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const dataLine = part
            .split("\n")
            .find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          const payloadRaw = dataLine.slice(5).trim();
          if (!payloadRaw) continue;
          try {
            const parsed = JSON.parse(payloadRaw) as NotificationStreamPayload;
            if (parsed.type === "heartbeat") continue;
            onEvent(parsed);
          } catch {
            // Ignore malformed SSE lines and keep stream alive.
          }
        }
      }
      backoff = 1000;
    } catch {
      // Stream can drop when backend idles; reconnect with backoff.
    }
    await new Promise((resolve) => setTimeout(resolve, backoff));
    backoff = Math.min(backoff * 2, 15000);
  }
}
