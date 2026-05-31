"use client";

// React context that owns the global time / locale settings (timezone
// and 12 vs 24-hour format). Consumed via the useTimeSettings() hook
// anywhere in the tree. Mounted inside the dashboard layout so it
// only fetches for authenticated users.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiError } from "@/lib/api/client";
import { getTimeSettings } from "@/lib/api/timeSettings";
import type { ApiTimeSettings } from "@/lib/api/types";
import { TIME_SETTINGS_FALLBACK } from "@/lib/time/format";

const STORAGE_KEY = "fleetsite.timeSettings.v1";

interface TimeSettingsContextValue {
  settings: ApiTimeSettings;
  isLoading: boolean;
  refresh: () => Promise<void>;
  // Optimistic setter so the settings panel can update the rest of the
  // app immediately on save without waiting for a re-fetch.
  setSettings: (next: ApiTimeSettings) => void;
}

const TimeSettingsContext = createContext<
  TimeSettingsContextValue | undefined
>(undefined);

function readCachedSettings(): ApiTimeSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ApiTimeSettings> | null;
    if (
      parsed &&
      typeof parsed.timezone === "string" &&
      (parsed.timeFormat === "12" || parsed.timeFormat === "24")
    ) {
      return { timezone: parsed.timezone, timeFormat: parsed.timeFormat };
    }
  } catch {
    // Ignore corrupt cache.
  }
  return null;
}

function writeCachedSettings(settings: ApiTimeSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable - silently drop the write.
  }
}

export function TimeSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<ApiTimeSettings>(
    () => readCachedSettings() ?? TIME_SETTINGS_FALLBACK,
  );
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const fresh = await getTimeSettings();
      setSettingsState(fresh);
      writeCachedSettings(fresh);
    } catch (err) {
      // 401 means the user signed out; leave the cache in place so the
      // login screen renders timestamps reasonably until re-auth.
      if (!(err instanceof ApiError)) {
        // Network errors leave the cached/fallback value unchanged.
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setSettings = useCallback((next: ApiTimeSettings) => {
    setSettingsState(next);
    writeCachedSettings(next);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  const value = useMemo<TimeSettingsContextValue>(
    () => ({ settings, isLoading, refresh, setSettings }),
    [settings, isLoading, refresh, setSettings],
  );

  return (
    <TimeSettingsContext.Provider value={value}>
      {children}
    </TimeSettingsContext.Provider>
  );
}

// Public hook. Falls back to the global default (Africa/Addis_Ababa / 12)
// when used outside the provider so SSR-rendered marketing pages and
// tests don't crash.
export function useTimeSettings(): TimeSettingsContextValue {
  const ctx = useContext(TimeSettingsContext);
  if (ctx) return ctx;
  return {
    settings: TIME_SETTINGS_FALLBACK,
    isLoading: false,
    refresh: async () => {},
    setSettings: () => {},
  };
}
