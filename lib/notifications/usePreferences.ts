"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/api/notifications";

export function useNotificationPreferences() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getNotificationPreferences();
        if (!cancelled) setPrefs(res);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = useCallback(
    async (partial: Partial<NotificationPreferences>) => {
      const next = await updateNotificationPreferences(partial);
      setPrefs(next);
      return next;
    },
    [],
  );

  return { prefs, setPrefs, loading, patch };
}
