"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { listSiteHealth, listSiteHealthHistory } from "@/lib/api/siteHealth";
import { listSites } from "@/lib/api/sites";
import type { ApiSiteHealthScore } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { toLocalDateKey } from "@/lib/trips/tripFormatters";

export type SiteOverviewRow = ApiSiteHealthScore & {
  name: string;
  /** Last 7 daily scores (oldest → newest) for sparkline. */
  historyScores: (number | null)[];
};

interface SitesOverviewState {
  sites: SiteOverviewRow[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  today: string;
  lastUpdatedAt: Date | null;
  refresh: () => void;
}

function last7DayKeys(endDate: string): string[] {
  const [y, m, d] = endDate.split("-").map(Number);
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(y, m - 1, d - i);
    keys.push(toLocalDateKey(dt));
  }
  return keys;
}

const SitesOverviewContext = createContext<SitesOverviewState | null>(null);

export function SitesOverviewProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sites, setSites] = useState<SiteOverviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  // Bumped each time `refresh()` is called to retrigger the loader. We
  // explicitly avoid auto-polling so the dashboard doesn't hammer the
  // health endpoints — the user pulls fresh data via the refresh button.
  const [refreshToken, setRefreshToken] = useState(0);

  const today = useMemo(() => toLocalDateKey(new Date()), []);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      // First-load vs subsequent refresh: keep the full-card skeleton only
      // for the initial paint; subsequent refreshes show the inline spinner
      // on the refresh button so the cards don't flash empty.
      const isInitialLoad = lastUpdatedAt == null;
      if (isInitialLoad) setIsLoading(true);
      else setIsRefreshing(true);

      try {
        const allSites = await listSites();
        const siteIds =
          user?.role === "ADMIN"
            ? allSites.map((s) => s.id)
            : (user?.sites ?? []).map((s) => s.id);

        const nameById = new Map(allSites.map((s) => [s.id, s.name]));
        const health = await listSiteHealth(today, siteIds);

        const historyFrom = last7DayKeys(today)[0];
        const histories = await Promise.all(
          health.map(async (row) => {
            try {
              const hist = await listSiteHealthHistory(
                row.siteId,
                historyFrom,
                today,
              );
              const byDate = new Map(hist.map((h) => [h.date, h.score]));
              const historyScores = last7DayKeys(today).map(
                (key) => byDate.get(key) ?? null,
              );
              return { siteId: row.siteId, historyScores };
            } catch {
              return {
                siteId: row.siteId,
                historyScores: last7DayKeys(today).map(() => null),
              };
            }
          }),
        );
        const historyBySite = new Map(
          histories.map((h) => [h.siteId, h.historyScores]),
        );

        const merged: SiteOverviewRow[] = health
          .map((row) => ({
            ...row,
            name: nameById.get(row.siteId) ?? "Unknown site",
            historyScores: historyBySite.get(row.siteId) ?? [],
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (!cancelled) {
          setSites(merged);
          setError(null);
          setLastUpdatedAt(new Date());
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load site overview",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // lastUpdatedAt is intentionally not in the dep array — including it
    // would cause an immediate re-fetch right after each successful load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, today, refreshToken]);

  const value = useMemo<SitesOverviewState>(
    () => ({
      sites,
      isLoading,
      isRefreshing,
      error,
      today,
      lastUpdatedAt,
      refresh,
    }),
    [sites, isLoading, isRefreshing, error, today, lastUpdatedAt, refresh],
  );

  return (
    <SitesOverviewContext.Provider value={value}>
      {children}
    </SitesOverviewContext.Provider>
  );
}

export function useSitesOverview(): SitesOverviewState {
  const ctx = useContext(SitesOverviewContext);
  if (!ctx) {
    throw new Error(
      "useSitesOverview must be used inside a <SitesOverviewProvider>",
    );
  }
  return ctx;
}
