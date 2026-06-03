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

import { ignoreForbidden } from "@/lib/api/ignoreForbidden";
import { listSiteHealthOverview } from "@/lib/api/siteHealth";
import { listMySites } from "@/lib/api/sites";
import type { ApiSite, ApiSiteHealthDimension, ApiSiteHealthScore } from "@/lib/api/types";
import { hasPermission } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { useScopedSiteIds } from "@/lib/auth/useScopedSiteIds";
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
  hasAssignments: boolean;
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

const STUB_DIMENSION: ApiSiteHealthDimension = {
  value: 0,
  normalized: 0,
  weight: 0,
  rescaledWeight: 0,
  applicable: false,
};

function siteRowWithoutHealth(site: ApiSite, today: string): SiteOverviewRow {
  const historyScores = last7DayKeys(today).map(() => null);
  return {
    siteId: site.id,
    name: site.name,
    date: today,
    score: null,
    status: null,
    insufficientData: true,
    dimensions: {
      driverAttendance: STUB_DIMENSION,
      vehicleAvailability: STUB_DIMENSION,
      tripTargetAchievement: STUB_DIMENSION,
      scheduleCompliance: STUB_DIMENSION,
      fuelEfficiencyVariance: STUB_DIMENSION,
      dataCompleteness: STUB_DIMENSION,
    },
    trucks: { total: 0, onsite: 0 },
    trips: { completed: 0, total: 0, target: 0 },
    fuel: { liters: 0 },
    computedAt: today,
    historyScores,
  };
}

const SitesOverviewContext = createContext<SitesOverviewState | null>(null);

export function SitesOverviewProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { hasAssignments } = useScopedSiteIds();
  const [sites, setSites] = useState<SiteOverviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const today = useMemo(() => toLocalDateKey(new Date()), []);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      const isInitialLoad = lastUpdatedAt == null;
      if (isInitialLoad) setIsLoading(true);
      else setIsRefreshing(true);

      try {
        const canSites = hasPermission(user, "sites.read");
        const canSiteHealth = hasPermission(user, "site-health.read");

        const scopedSites = canSites
          ? await listMySites().catch(ignoreForbidden([] as ApiSite[]))
          : [];

        const siteIds = scopedSites.map((s) => s.id);
        const nameById = new Map(scopedSites.map((s) => [s.id, s.name]));

        let merged: SiteOverviewRow[];

        if (canSiteHealth && siteIds.length > 0) {
          const overview = await listSiteHealthOverview(today, siteIds, 7).catch(
            ignoreForbidden(
              [] as Array<{
                siteId: string;
                current: ApiSiteHealthScore | null;
                history: ApiSiteHealthScore[];
              }>,
            ),
          );

          const dayKeys = last7DayKeys(today);
          merged = overview
            .map((row) => {
              const current = row.current;
              const byDate = new Map(
                row.history.map((h) => [h.date, h.score]),
              );
              const historyScores = dayKeys.map((key) => byDate.get(key) ?? null);
              if (current) {
                return {
                  ...current,
                  name: nameById.get(row.siteId) ?? "Unknown site",
                  historyScores,
                };
              }
              const site = scopedSites.find((s) => s.id === row.siteId);
              if (site) {
                return {
                  ...siteRowWithoutHealth(site, today),
                  historyScores,
                };
              }
              return null;
            })
            .filter((row): row is SiteOverviewRow => row != null)
            .sort((a, b) => a.name.localeCompare(b.name));
        } else {
          merged = scopedSites
            .map((site) => siteRowWithoutHealth(site, today))
            .sort((a, b) => a.name.localeCompare(b.name));
        }

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
      hasAssignments,
      refresh,
    }),
    [
      sites,
      isLoading,
      isRefreshing,
      error,
      today,
      lastUpdatedAt,
      hasAssignments,
      refresh,
    ],
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
