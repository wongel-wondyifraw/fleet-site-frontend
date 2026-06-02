"use client";

import { useEffect, useMemo, useState } from "react";

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

function last7DayKeys(endDate: string): string[] {
  const [y, m, d] = endDate.split("-").map(Number);
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(y, m - 1, d - i);
    keys.push(toLocalDateKey(dt));
  }
  return keys;
}

export function useSitesOverview() {
  const { user } = useAuth();
  const [sites, setSites] = useState<SiteOverviewRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => toLocalDateKey(new Date()), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
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
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load site overview",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    if (user) load();
    return () => {
      cancelled = true;
    };
  }, [user, today]);

  return { sites, isLoading, error, today };
}
