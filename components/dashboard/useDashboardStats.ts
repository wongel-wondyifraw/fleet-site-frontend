"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  Building2,
  Clock,
  Fuel,
  Route,
  Truck,
} from "@/lib/icons";

import { listAttendanceRosterBulk } from "@/lib/api/attendance";
import { listFuelConsumptionRosterBulk } from "@/lib/api/fuel";
import { ignoreForbidden } from "@/lib/api/ignoreForbidden";
import { listMySites } from "@/lib/api/sites";
import { listTrips } from "@/lib/api/trips";
import { listVehiclesLookup } from "@/lib/api/vehicles";
import { hasPermission, type ApiSite, type ApiTrip, type ApiVehicle } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { useScopedSiteIds } from "@/lib/auth/useScopedSiteIds";
import { toLocalDateKey } from "@/lib/trips/tripFormatters";

// Public shape consumed by MetricCard. Mirrors the previous static
// DASHBOARD_STATS entry so the rendering code stays unchanged.
export type DashboardKpi = {
  label: string;
  value: string;
  suffix?: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  tone: "blue" | "red";
};

type RawStats = {
  vehicles: ApiVehicle[];
  sites: ApiSite[];
  trips: ApiTrip[];
  fuelLitersToday: number;
  fuelLitersYesterday: number;
  loadedAtMs: number;
  // Count of drivers who have actually checked in today (PRESENT / ON_BREAK
  // / DONE on their AttendanceDay), aggregated across every site the user
  // can see. Used as the "X onsite" suffix on the Total Trucks tile so the
  // number reflects who is physically working rather than the static
  // vehicle status field.
  checkedInDrivers: number;
};

// Loading-state placeholder list — same length / shape as the resolved
// KPIs so the layout doesn't reflow once data lands.
const LOADING_STATS: DashboardKpi[] = [
  {
    label: "Total Trucks",
    value: "—",
    detail: "Loading…",
    icon: Truck,
    tone: "blue",
  },
  {
    label: "Total Sites",
    value: "—",
    detail: "Loading…",
    icon: Building2,
    tone: "blue",
  },
  {
    label: "Active Trips",
    value: "—",
    detail: "Loading…",
    icon: Route,
    tone: "blue",
  },
  {
    label: "Fuel Today",
    value: "—",
    suffix: "L",
    detail: "Loading…",
    icon: Fuel,
    tone: "blue",
  },
  {
    label: "Trip Delays",
    value: "—",
    detail: "Loading…",
    icon: Clock,
    tone: "red",
  },
];

function sumEstimatedLiters(
  bySite: Record<string, Array<{ estimatedLiters?: number | null }>>,
): number {
  let total = 0;
  for (const rows of Object.values(bySite)) {
    for (const row of rows) {
      if (typeof row.estimatedLiters === "number" && Number.isFinite(row.estimatedLiters)) {
        total += row.estimatedLiters;
      }
    }
  }
  return total;
}

// AttendanceDay statuses that mean the driver has actually punched in
// today (`EXPECTED` is the lazy default before any punch, `ABSENT` is a
// past-date no-show, and `ON_LEAVE` is an excused override — none of
// those count as "on site").
const CHECKED_IN_STATUSES = new Set(["PRESENT", "ON_BREAK", "DONE"]);

const EMPTY_FUEL_BULK = {
  bySite: {} as Record<string, Array<{ estimatedLiters?: number | null }>>,
};
const EMPTY_ATTENDANCE_BULK = {
  bySite: {} as Record<string, Array<{ status: string; driverId: string }>>,
};

export function useDashboardStats(): {
  stats: DashboardKpi[];
  siteCount: number | null;
  hasAssignments: boolean;
  isLoading: boolean;
  error: string | null;
} {
  const { user } = useAuth();
  const { hasAssignments } = useScopedSiteIds();
  const [data, setData] = useState<RawStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const today = toLocalDateKey(new Date());
        const yesterday = toLocalDateKey(
          new Date(Date.now() - 24 * 60 * 60 * 1000),
        );

        const canVehicles = hasPermission(user, "vehicles.read");
        const canSites = hasPermission(user, "sites.read");
        const canTrips = hasPermission(user, "trips.read");
        const canFuel = hasPermission(user, "fuel.read");
        const canAttendance = hasPermission(user, "attendance.read");

        // Phase 1: each fetch is gated on its own permission so a reduced
        // role (e.g. Time Keeper with bypass but no trips.read) degrades
        // individual tiles instead of failing the whole dashboard.
        const [vehicles, sites, trips] = await Promise.all([
          canVehicles
            ? listVehiclesLookup().catch(ignoreForbidden([] as ApiVehicle[]))
            : Promise.resolve([] as ApiVehicle[]),
          canSites
            ? listMySites().catch(ignoreForbidden([] as ApiSite[]))
            : Promise.resolve([] as ApiSite[]),
          canTrips
            ? listTrips({ date: today }).catch(ignoreForbidden([] as ApiTrip[]))
            : Promise.resolve([] as ApiTrip[]),
        ]);

        const siteIds = sites.map((s) => s.id);
        let fuelLitersToday = 0;
        let fuelLitersYesterday = 0;
        let checkedInDrivers = 0;

        if (siteIds.length > 0) {
          const fuelPromise =
            canFuel
              ? Promise.all([
                  listFuelConsumptionRosterBulk({ date: today, siteIds }).catch(
                    ignoreForbidden(EMPTY_FUEL_BULK),
                  ),
                  listFuelConsumptionRosterBulk({ date: yesterday, siteIds }).catch(
                    ignoreForbidden(EMPTY_FUEL_BULK),
                  ),
                ])
              : Promise.resolve([EMPTY_FUEL_BULK, EMPTY_FUEL_BULK] as const);

          const attendancePromise = canAttendance
            ? listAttendanceRosterBulk({ date: today, siteIds }).catch(
                ignoreForbidden(EMPTY_ATTENDANCE_BULK),
              )
            : Promise.resolve(EMPTY_ATTENDANCE_BULK);

          const [fuelPair, attendanceBulk] = await Promise.all([
            fuelPromise,
            attendancePromise,
          ]);

          const [todayRoster, yRoster] = fuelPair;
          fuelLitersToday = sumEstimatedLiters(todayRoster.bySite);
          fuelLitersYesterday = sumEstimatedLiters(yRoster.bySite);

          const checkedInIds = new Set<string>();
          for (const days of Object.values(attendanceBulk.bySite)) {
            for (const day of days) {
              if (CHECKED_IN_STATUSES.has(day.status)) {
                checkedInIds.add(day.driverId);
              }
            }
          }
          checkedInDrivers = checkedInIds.size;
        }

        if (!cancelled) {
          setData({
            vehicles,
            sites,
            trips,
            fuelLitersToday,
            fuelLitersYesterday,
            loadedAtMs: Date.now(),
            checkedInDrivers,
          });
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const stats = useMemo<DashboardKpi[]>(() => {
    if (!data) return LOADING_STATS;

    const {
      vehicles,
      sites,
      trips,
      fuelLitersToday,
      fuelLitersYesterday,
      loadedAtMs,
      checkedInDrivers,
    } = data;

    // Trucks
    const totalTrucks = vehicles.length;
    const inMaintenance = vehicles.filter((v) => v.status === "IN_MAINTENANCE").length;

    // Sites
    const totalSites = sites.length;
    const activeSites = sites.filter((s) => s.status === "ACTIVE").length;

    // Trips today
    const activeTrips = trips.filter((t) => t.status === "IN_PROGRESS").length;
    const completedToday = trips.filter((t) => t.status === "COMPLETED").length;
    const delayedTrips = trips.filter((t) => {
      if (t.status !== "PLANNED") return false;
      if (!t.scheduledAt) return false;
      return new Date(t.scheduledAt).getTime() < loadedAtMs;
    }).length;

    // Fuel delta vs yesterday
    const fuelDeltaPct =
      fuelLitersYesterday > 0
        ? ((fuelLitersToday - fuelLitersYesterday) / fuelLitersYesterday) * 100
        : null;

    return [
      {
        label: "Total Trucks",
        value: totalTrucks.toLocaleString(),
        suffix: `| ${checkedInDrivers.toLocaleString()} onsite`,
        detail:
          inMaintenance > 0
            ? `${inMaintenance} in maintenance`
            : "All operational",
        icon: Truck,
        tone: "blue",
      },
      {
        label: "Total Sites",
        value: totalSites.toLocaleString(),
        detail:
          activeSites === totalSites && totalSites > 0
            ? "All operational"
            : `${activeSites} active`,
        icon: Building2,
        tone: "blue",
      },
      {
        label: "Active Trips",
        value: activeTrips.toLocaleString(),
        detail:
          completedToday > 0
            ? `${completedToday} completed today`
            : "Nothing wrapped yet",
        icon: Route,
        tone: "blue",
      },
      {
        label: "Fuel Today",
        value: Math.round(fuelLitersToday).toLocaleString(),
        suffix: "L",
        detail:
          fuelDeltaPct == null
            ? "No data yesterday"
            : `${fuelDeltaPct >= 0 ? "+" : ""}${fuelDeltaPct.toFixed(1)}% vs yesterday`,
        icon: Fuel,
        tone: "blue",
      },
      {
        label: "Trip Delays",
        value: delayedTrips.toLocaleString(),
        detail:
          delayedTrips === 0
            ? "On schedule"
            : "Planned trips past start time",
        icon: Clock,
        tone: "red",
      },
    ];
  }, [data]);

  const siteCount = data ? data.sites.length : null;

  return { stats, siteCount, hasAssignments, isLoading, error };
}
