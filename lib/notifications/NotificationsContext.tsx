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
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  countUnread,
  createSampleFeed,
  type NotificationItem,
} from "@/lib/notifications/data";

interface NotificationsContextValue {
  items: NotificationItem[];
  unreadCount: number;
  markRead: (id: string) => void;
  markUnread: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>(() =>
    createSampleFeed(),
  );

  const markRead = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item)),
    );
  }, []);

  const markUnread = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: false } : item)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  const unreadCount = useMemo(() => countUnread(items), [items]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unreadCount,
      markRead,
      markUnread,
      markAllRead,
      remove,
      clearAll,
    }),
    [items, unreadCount, markRead, markUnread, markAllRead, remove, clearAll],
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
  };
}
