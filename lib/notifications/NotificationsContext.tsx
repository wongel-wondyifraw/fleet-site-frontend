"use client";

// Single source of truth for the notification feed so the bell popover
// in the sidebar/top bar and the dedicated /notifications inbox page
// share the same items + read state. Marking something as read in the
// popover updates the inbox immediately and vice versa.
//
// The provider currently seeds itself from `createSampleFeed()` so the
// design is fully wired during development. When the real notifications
// API lands, replace the body of the bootstrap effect with a fetch (and
// optionally swap setState for a subscription) — no consumer changes
// required.

import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  type NotificationItem,
} from "@/lib/notifications/data";
import {
  clearAllNotifications,
  getNotificationPreferences,
  listNotifications,
  markAllRead as markAllReadRequest,
  markRead as markReadRequest,
  markUnread as markUnreadRequest,
  openNotificationsStream,
  removeNotification,
  updateNotificationPreferences,
  type NotificationPreferences,
  type NotificationStreamPayload,
} from "@/lib/api/notifications";
import { showInTab } from "@/lib/notifications/browserToast";
import { useToast } from "@/lib/toast/ToastContext";

interface NotificationsContextValue {
  items: NotificationItem[];
  unreadCount: number;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
  preferences: NotificationPreferences | null;
  updatePreferences: (
    patch: Partial<Pick<NotificationPreferences, "inAppPerKind" | "osToastPerKind" | "webPushPerKind">>,
  ) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [page, prefs] = await Promise.all([
          listNotifications({ limit: 100 }),
          getNotificationPreferences(),
        ]);
        if (cancelled) return;
        setItems(page.data);
        setPreferences(prefs);
      } catch {
        if (cancelled) return;
        setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void openNotificationsStream(
      (evt: NotificationStreamPayload) => {
        if (evt.item && evt.type === "notification.created") {
          setItems((prev) => [evt.item!, ...prev.filter((x) => x.id !== evt.item!.id)]);
          showInTab(evt.item, preferences?.osToastPerKind);
        }
        if (evt.item && evt.type === "notification.updated") {
          setItems((prev) =>
            prev.map((item) => (item.id === evt.item!.id ? evt.item! : item)),
          );
        }
      },
      controller.signal,
    );
    return () => controller.abort();
  }, [preferences?.osToastPerKind]);

  const markRead = useCallback((id: string) => {
    const prev = items;
    setItems(() =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item)),
    );
    void markReadRequest(id).catch(() => {
      setItems(prev);
      showToast({ variant: "error", message: "Could not mark notification read." });
    });
  }, [items, showToast]);

  const markUnread = useCallback((id: string) => {
    const prev = items;
    setItems(() =>
      prev.map((item) => (item.id === id ? { ...item, read: false } : item)),
    );
    void markUnreadRequest(id).catch(() => {
      setItems(prev);
      showToast({
        variant: "error",
        message: "Could not mark notification unread.",
      });
    });
  }, [items, showToast]);

  const markAllRead = useCallback(() => {
    const prev = items;
    setItems((curr) => curr.map((item) => ({ ...item, read: true })));
    void markAllReadRequest().catch(() => {
      setItems(prev);
      showToast({ variant: "error", message: "Could not mark all as read." });
    });
  }, [items, showToast]);

  const remove = useCallback((id: string) => {
    const prev = items;
    setItems((curr) => curr.filter((item) => item.id !== id));
    void removeNotification(id).catch(() => {
      setItems(prev);
      showToast({ variant: "error", message: "Could not remove notification." });
    });
  }, [items, showToast]);

  const clearAll = useCallback(() => {
    const prev = items;
    setItems([]);
    void clearAllNotifications().catch(() => {
      setItems(prev);
      showToast({ variant: "error", message: "Could not clear notifications." });
    });
  }, [items, showToast]);

  const unreadCount = useMemo(
    () => items.reduce((n, item) => n + (item.read ? 0 : 1), 0),
    [items],
  );

  const updatePreferences = useCallback(
    async (
      patch: Partial<
        Pick<
          NotificationPreferences,
          "inAppPerKind" | "osToastPerKind" | "webPushPerKind"
        >
      >,
    ) => {
      const next = await updateNotificationPreferences(patch);
      setPreferences(next);
    },
    [],
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unreadCount,
      markRead,
      markUnread,
      markAllRead,
      remove,
      clearAll,
      preferences,
      updatePreferences,
    }),
    [
      items,
      unreadCount,
      markRead,
      markUnread,
      markAllRead,
      remove,
      clearAll,
      preferences,
      updatePreferences,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

// Public hook. Falls back to an empty inert feed when used outside the
// provider so SSR-rendered marketing/login surfaces don't crash.
export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (ctx) return ctx;
  return {
    items: [],
    unreadCount: 0,
    markRead: () => {},
    markUnread: () => {},
    markAllRead: () => {},
    remove: () => {},
    clearAll: () => {},
    preferences: null,
    updatePreferences: async () => {},
  };
}
