"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  Activity,
  ArrowLeft,
  Ban,
  CheckCircle,
  Clock,
  Coffee,
  Fuel,
  Gauge,
  LogIn,
  LogOut,
  MapPin,
  Route,
  Timer,
  Truck,
  Wrench,
} from "@/lib/icons";

import { ignoreForbidden } from "@/lib/api/ignoreForbidden";
import { listAttendanceRoster } from "@/lib/api/attendance";
import { listFuelConsumptionRoster } from "@/lib/api/fuel";
import { listSiteHealth, listSiteHealthHistory } from "@/lib/api/siteHealth";
import { getSite } from "@/lib/api/sites";
import { listTrips } from "@/lib/api/trips";
import { listVehiclesLookup } from "@/lib/api/vehicles";
import { hasPermission } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { isScopedToSites } from "@/lib/auth/useScopedSiteIds";
import type {
  ApiAttendanceDay,
  ApiFuelConsumptionDay,
  ApiSite,
  ApiSiteHealthDimension,
  ApiSiteHealthScore,
  ApiTrip,
  ApiVehicle,
  SiteHealthStatusBand,
} from "@/lib/api/types";
import { staggerStyle } from "@/lib/animations";
import {
  formatCount,
  formatFuelLiters,
  formatSiteHealthPercent,
  formatSiteHealthScore,
} from "@/lib/site-health/format";
import { siteHealthLabel } from "@/lib/site-health/labels";
import { formatTimeOfDay } from "@/lib/time/format";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import { toLocalDateKey } from "@/lib/trips/tripFormatters";
import { cn } from "@/lib/utils";

type Tone = "blue" | "green" | "amber" | "red";

const STATUS_TONE: Record<SiteHealthStatusBand | "NEUTRAL", Tone> = {
  GOOD: "green",
  WATCH: "amber",
  CRITICAL: "red",
  NEUTRAL: "blue",
};

const TONE_STYLES: Record<Tone, { soft: string; bar: string; ring: string; text: string }> = {
  blue: {
    soft: "bg-primary/10 text-primary",
    bar: "bg-primary",
    ring: "border-primary/20",
    text: "text-primary",
  },
  green: {
    soft: "bg-success/15 text-success",
    bar: "bg-success",
    ring: "border-success/20",
    text: "text-success",
  },
  amber: {
    soft: "bg-amber-100 text-amber-700",
    bar: "bg-amber-500",
    ring: "border-amber-200",
    text: "text-amber-700",
  },
  red: {
    soft: "bg-destructive/10 text-destructive",
    bar: "bg-destructive",
    ring: "border-destructive/20",
    text: "text-destructive",
  },
};

const DIMENSION_ROWS: Array<{
  key: keyof ApiSiteHealthScore["dimensions"];
  labelKey: Parameters<typeof siteHealthLabel>[0];
}> = [
  { key: "driverAttendance", labelKey: "siteHealth.dimension.attendance" },
  { key: "vehicleAvailability", labelKey: "siteHealth.dimension.vehicles" },
  { key: "tripTargetAchievement", labelKey: "siteHealth.dimension.trips" },
  { key: "scheduleCompliance", labelKey: "siteHealth.dimension.schedule" },
  { key: "fuelEfficiencyVariance", labelKey: "siteHealth.dimension.fuel" },
  { key: "dataCompleteness", labelKey: "siteHealth.dimension.data" },
];

const CHECKED_IN_STATUSES = new Set(["PRESENT", "ON_BREAK", "DONE"]);

function last7DayKeys(endDate: string): string[] {
  const [y, m, d] = endDate.split("-").map(Number);
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(y, m - 1, d - i);
    keys.push(toLocalDateKey(dt));
  }
  return keys;
}

interface SiteDashboardData {
  site: ApiSite;
  snapshot: ApiSiteHealthScore | null;
  historyScores: (number | null)[];
  vehicles: ApiVehicle[];
  trips: ApiTrip[];
  attendance: ApiAttendanceDay[];
  fuel: ApiFuelConsumptionDay[];
  loadedAtMs: number;
}

function statusLabel(snap: ApiSiteHealthScore | null): string {
  if (!snap || snap.insufficientData)
    return siteHealthLabel("siteHealth.status.insufficient");
  switch (snap.status) {
    case "GOOD":
      return siteHealthLabel("siteHealth.status.good");
    case "WATCH":
      return siteHealthLabel("siteHealth.status.watch");
    case "CRITICAL":
      return siteHealthLabel("siteHealth.status.critical");
    default:
      return "—";
  }
}

function statusTone(snap: ApiSiteHealthScore | null): Tone {
  if (!snap || snap.insufficientData || !snap.status) return STATUS_TONE.NEUTRAL;
  return STATUS_TONE[snap.status];
}

function percentLabel(count: number, total: number): string {
  if (total <= 0) return "0%";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(count / total);
}

function TrendChart({ scores }: { scores: (number | null)[] }) {
  const valid = scores.filter((s): s is number => s != null && Number.isFinite(s));
  if (valid.length < 2) {
    return (
      <p className="text-xs text-muted-foreground">
        Not enough history yet — check back tomorrow.
      </p>
    );
  }

  const w = 100;
  const h = 32;
  const min = Math.min(...valid, 0);
  const max = Math.max(...valid, 100);
  const range = max - min || 1;

  const points = scores
    .map((score, i) => {
      if (score == null || !Number.isFinite(score)) return null;
      const x = (i / (scores.length - 1)) * w;
      const y = h - ((score - min) / range) * (h - 6) - 3;
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-12 w-full text-primary"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function DimensionBar({
  label,
  dim,
}: {
  label: string;
  dim: ApiSiteHealthDimension;
}) {
  if (!dim.applicable) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-primary">{label}</span>
        <span className="font-semibold text-primary">
          {Math.round(dim.normalized)}
          <span className="ml-1 font-normal text-muted-foreground">
            ({formatSiteHealthPercent(dim.value)})
          </span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, dim.normalized)}%` }}
        />
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  suffix,
  detail,
  icon: Icon,
  tone,
  index,
}: {
  label: string;
  value: string;
  suffix?: string;
  detail: string;
  icon: typeof Truck;
  tone: Tone;
  index: number;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div
      className="fs-card-in rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm min-h-28"
      style={staggerStyle(index)}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-xl",
            styles.soft,
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className={cn("h-1.5 w-10 rounded-full", styles.bar)} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-primary">{value}</span>
        {suffix ? (
          <span className="text-xs font-semibold text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs font-semibold text-primary">{label}</p>
      <p className={cn("mt-2 text-[11px]", styles.text)}>{detail}</p>
    </div>
  );
}

function FuelByDriver({ rows }: { rows: ApiFuelConsumptionDay[] }) {
  const aggregated = useMemo(() => {
    const map = new Map<string, { name: string; liters: number }>();
    for (const row of rows) {
      const liters = row.estimatedLiters;
      if (typeof liters !== "number" || !Number.isFinite(liters)) continue;
      const id = row.driverId;
      const name = row.driver
        ? `${row.driver.firstName} ${row.driver.lastName}`.trim()
        : "Unknown driver";
      const prev = map.get(id) ?? { name, liters: 0 };
      prev.liters += liters;
      map.set(id, prev);
    }
    const top = [...map.values()].sort((a, b) => b.liters - a.liters).slice(0, 5);
    const max = Math.max(...top.map((r) => r.liters), 1);
    return top.map((row) => ({
      ...row,
      pct: Math.max(3, (row.liters / max) * 100),
    }));
  }, [rows]);

  if (aggregated.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No fuel recorded today.</p>
    );
  }

  return (
    <div className="space-y-2">
      {aggregated.map((row) => (
        <div
          key={row.name}
          className="grid grid-cols-[110px_1fr_72px] items-center gap-2 text-xs"
        >
          <span className="truncate font-medium text-primary">{row.name}</span>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${row.pct}%` }}
            />
          </div>
          <span className="text-right text-[11px] text-muted-foreground">
            {formatFuelLiters(row.liters)}
          </span>
        </div>
      ))}
    </div>
  );
}

function TripStatusPie({
  trips,
  loadedAtMs,
}: {
  trips: ApiTrip[];
  loadedAtMs: number;
}) {
  const total = trips.length;
  const completed = trips.filter((t) => t.status === "COMPLETED").length;
  const inProgress = trips.filter((t) => t.status === "IN_PROGRESS").length;
  const delayed = trips.filter(
    (t) =>
      t.status === "PLANNED" &&
      !!t.scheduledAt &&
      new Date(t.scheduledAt).getTime() < loadedAtMs,
  ).length;
  const cancelled = trips.filter((t) => t.status === "CANCELLED").length;

  const rows = [
    { label: "Completed", count: completed, swatch: "bg-primary" },
    { label: "In Progress", count: inProgress, swatch: "bg-primary/40" },
    { label: "Delayed", count: delayed, swatch: "bg-amber-500" },
    { label: "Cancelled", count: cancelled, swatch: "bg-destructive" },
  ];

  const completedDeg = total ? (completed / total) * 360 : 0;
  const progressDeg = total ? (inProgress / total) * 360 : 0;
  const delayedDeg = total ? (delayed / total) * 360 : 0;
  const conic = total
    ? `conic-gradient(var(--palette-primary) 0 ${completedDeg}deg, color-mix(in_srgb,var(--palette-primary)_40%,white) ${completedDeg}deg ${completedDeg + progressDeg}deg, #f59e0b ${completedDeg + progressDeg}deg ${completedDeg + progressDeg + delayedDeg}deg, var(--palette-negative) ${completedDeg + progressDeg + delayedDeg}deg 360deg)`
    : "#f1f5f9";

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="grid size-24 shrink-0 place-items-center rounded-full p-3"
        style={{ background: conic }}
      >
        <div className="grid size-16 place-items-center rounded-full bg-white text-center">
          <span className="text-lg font-bold text-primary">{formatCount(total)}</span>
          <span className="-mt-2 text-[10px] text-muted-foreground">Trips</span>
        </div>
      </div>
      <div className="w-full space-y-1.5">
        {rows.map((status) => (
          <div
            key={status.label}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span className={cn("size-2 shrink-0 rounded-full", status.swatch)} />
              <span className="truncate">{status.label}</span>
            </span>
            <span className="shrink-0 font-semibold whitespace-nowrap text-primary">
              {formatCount(status.count)}{" "}
              <span className="font-normal text-muted-foreground">
                ({percentLabel(status.count, total)})
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent activity feed.
// Activities are derived (not stored as a separate "events" table) from the
// timestamps already on trips and attendance punches. Each activity has a
// canonical `at` Date so we can sort everything onto a single stream.
// ---------------------------------------------------------------------------

type ActivityTone = "blue" | "green" | "amber" | "red" | "neutral";

interface ActivityEvent {
  id: string;
  at: Date;
  icon: typeof Truck;
  tone: ActivityTone;
  title: string;
  subtitle: string;
}

const ACTIVITY_TONE_STYLES: Record<ActivityTone, string> = {
  blue: "bg-primary/10 text-primary",
  green: "bg-success/15 text-success",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-destructive/10 text-destructive",
  neutral: "bg-slate-100 text-muted-foreground",
};

function tripLabel(trip: ApiTrip): string {
  if (trip.vehicle?.plateNumber) return trip.vehicle.plateNumber;
  if (trip.vehicle?.assetNumber) return trip.vehicle.assetNumber;
  return "Vehicle";
}

function driverLabel(day: ApiAttendanceDay): string {
  if (day.driver) return `${day.driver.firstName} ${day.driver.lastName}`.trim();
  return "Driver";
}

function buildActivities(
  trips: ApiTrip[],
  attendance: ApiAttendanceDay[],
): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  // Trip events derived from the persisted timestamps + status. We only
  // emit one event per trip — the most recent transition we have evidence
  // for — so the feed isn't dominated by a single trip's full lifecycle.
  for (const trip of trips) {
    const truck = tripLabel(trip);
    const route = `${trip.startCity ?? trip.startAddress} → ${trip.endCity ?? trip.endAddress}`;
    if (trip.status === "COMPLETED" && trip.completedAt) {
      events.push({
        id: `trip-${trip.id}-completed`,
        at: new Date(trip.completedAt),
        icon: CheckCircle,
        tone: "green",
        title: `Trip completed · ${truck}`,
        subtitle: route,
      });
    } else if (trip.status === "IN_PROGRESS" && trip.startedAt) {
      events.push({
        id: `trip-${trip.id}-started`,
        at: new Date(trip.startedAt),
        icon: Route,
        tone: "blue",
        title: `Trip started · ${truck}`,
        subtitle: route,
      });
    } else if (trip.status === "CANCELLED") {
      events.push({
        id: `trip-${trip.id}-cancelled`,
        at: new Date(trip.updatedAt ?? trip.createdAt ?? Date.now()),
        icon: Ban,
        tone: "red",
        title: `Trip cancelled · ${truck}`,
        subtitle: route,
      });
    }
  }

  // Attendance punches — one feed item per non-voided punch.
  for (const day of attendance) {
    const driver = driverLabel(day);
    for (const punch of day.punches ?? []) {
      if (punch.isVoided) continue;
      const at = new Date(punch.at);
      if (Number.isNaN(at.getTime())) continue;
      let icon: typeof Truck = LogIn;
      let tone: ActivityTone = "blue";
      let title = "Punch";
      switch (punch.type) {
        case "DAY_IN":
          icon = LogIn;
          tone = "green";
          title = `Checked in · ${driver}`;
          break;
        case "DAY_OUT":
          icon = LogOut;
          tone = "blue";
          title = `Checked out · ${driver}`;
          break;
        case "LUNCH_OUT":
          icon = Coffee;
          tone = "amber";
          title = `Lunch break · ${driver}`;
          break;
        case "LUNCH_IN":
          icon = Coffee;
          tone = "blue";
          title = `Back from lunch · ${driver}`;
          break;
        case "MAINT_OUT":
          icon = Wrench;
          tone = "amber";
          title = `Maintenance start · ${driver}`;
          break;
        case "MAINT_IN":
          icon = Wrench;
          tone = "blue";
          title = `Maintenance end · ${driver}`;
          break;
      }
      events.push({
        id: `punch-${punch.id}`,
        at,
        icon,
        tone,
        title,
        subtitle: day.site?.name
          ? day.site.name
          : punch.note ?? "",
      });
    }
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
}

function RecentActivityCard({
  trips,
  attendance,
  limit = 12,
}: {
  trips: ApiTrip[];
  attendance: ApiAttendanceDay[];
  limit?: number;
}) {
  const { settings: timeSettings } = useTimeSettings();
  const events = useMemo(
    () => buildActivities(trips, attendance).slice(0, limit),
    [trips, attendance, limit],
  );

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No activity recorded yet today.
      </p>
    );
  }

  return (
    <ol className="relative space-y-3">
      {events.map((event) => {
        const Icon = event.icon;
        return (
          <li key={event.id} className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                ACTIVITY_TONE_STYLES[event.tone],
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-primary">
                {event.title}
              </p>
              {event.subtitle ? (
                <p className="truncate text-[11px] text-muted-foreground">
                  {event.subtitle}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
              {formatTimeOfDay(event.at, timeSettings)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function AttendanceBreakdown({ days }: { days: ApiAttendanceDay[] }) {
  const total = days.length;
  const present = days.filter((d) => d.status === "PRESENT").length;
  const onBreak = days.filter((d) => d.status === "ON_BREAK").length;
  const done = days.filter((d) => d.status === "DONE").length;
  const absent = days.filter((d) => d.status === "ABSENT").length;
  const onLeave = days.filter((d) => d.status === "ON_LEAVE").length;
  const expected = days.filter((d) => d.status === "EXPECTED").length;

  const rows = [
    { label: "Present", count: present, swatch: "bg-success" },
    { label: "On break", count: onBreak, swatch: "bg-primary/40" },
    { label: "Done", count: done, swatch: "bg-primary" },
    { label: "Expected", count: expected, swatch: "bg-slate-300" },
    { label: "Absent", count: absent, swatch: "bg-destructive" },
    { label: "On leave", count: onLeave, swatch: "bg-amber-400" },
  ];

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No driver roster for today.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {rows
        .filter((row) => row.count > 0)
        .map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className={cn("size-2 rounded-full", row.swatch)} />
              {row.label}
            </span>
            <span className="font-semibold text-primary">
              {formatCount(row.count)}{" "}
              <span className="font-normal text-muted-foreground">
                ({percentLabel(row.count, total)})
              </span>
            </span>
          </div>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vehicle status / fleet capacity panel — shows the per-status breakdown
// of this site's vehicles. Useful for spotting capacity loss to
// maintenance or retired equipment.
// ---------------------------------------------------------------------------

const VEHICLE_STATUS_ROWS: Array<{
  status: ApiVehicle["status"];
  label: string;
  swatch: string;
}> = [
  { status: "ACTIVE", label: "Active", swatch: "bg-success" },
  { status: "IDLE", label: "Idle", swatch: "bg-primary/40" },
  { status: "IN_MAINTENANCE", label: "In maintenance", swatch: "bg-amber-500" },
  { status: "OUT_OF_SERVICE", label: "Out of service", swatch: "bg-destructive" },
  { status: "RETIRED", label: "Retired", swatch: "bg-slate-300" },
];

function VehicleStatusPanel({ vehicles }: { vehicles: ApiVehicle[] }) {
  const total = vehicles.length;
  const counts = useMemo(() => {
    const map = new Map<ApiVehicle["status"], number>();
    for (const v of vehicles) map.set(v.status, (map.get(v.status) ?? 0) + 1);
    return map;
  }, [vehicles]);

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No vehicles assigned to this site.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {VEHICLE_STATUS_ROWS.map((row) => {
        const count = counts.get(row.status) ?? 0;
        if (count === 0) return null;
        const pct = (count / total) * 100;
        return (
          <div key={row.status} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-medium text-primary">
                <span className={cn("size-2 rounded-full", row.swatch)} />
                {row.label}
              </span>
              <span className="font-semibold text-primary">
                {formatCount(count)}{" "}
                <span className="font-normal text-muted-foreground">
                  ({percentLabel(count, total)})
                </span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={cn("h-full", row.swatch)} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Currently on the road" — live list of in-progress trips for the site
// with elapsed time. Tactical view a site manager glances at to see who
// is out and how long they've been on the route.
// ---------------------------------------------------------------------------

function formatElapsed(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return "—";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function ActiveTripsPanel({
  trips,
  loadedAtMs,
  limit = 5,
}: {
  trips: ApiTrip[];
  loadedAtMs: number;
  limit?: number;
}) {
  const { settings: timeSettings } = useTimeSettings();
  const active = useMemo(() => {
    return trips
      .filter((trip) => trip.status === "IN_PROGRESS" && trip.startedAt)
      .map((trip) => ({
        trip,
        startedMs: new Date(trip.startedAt!).getTime(),
        elapsedMs: loadedAtMs - new Date(trip.startedAt!).getTime(),
      }))
      .sort((a, b) => a.startedMs - b.startedMs)
      .slice(0, limit);
  }, [trips, loadedAtMs, limit]);

  if (active.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No trips on the road right now.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {active.map(({ trip, startedMs, elapsedMs }) => {
        const truck = tripLabel(trip);
        const driver = trip.driver
          ? `${trip.driver.firstName} ${trip.driver.lastName}`.trim()
          : "Unassigned driver";
        const route = `${trip.startCity ?? trip.startAddress} → ${trip.endCity ?? trip.endAddress}`;
        return (
          <li
            key={trip.id}
            className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-2"
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Truck className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-primary">
                {truck}{" "}
                <span className="font-normal text-muted-foreground">
                  · {driver}
                </span>
              </p>
              <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                <MapPin className="size-3" />
                {route}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="text-[11px] font-semibold text-primary">
                {formatElapsed(elapsedMs)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Started {formatTimeOfDay(new Date(startedMs), timeSettings)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// "Top vehicles today" — ranks the site's vehicles by today's trip count
// and total distance. Surfaces the workhorses (or underused trucks).
// ---------------------------------------------------------------------------

function TopVehiclesPanel({
  vehicles,
  trips,
  limit = 5,
}: {
  vehicles: ApiVehicle[];
  trips: ApiTrip[];
  limit?: number;
}) {
  const rows = useMemo(() => {
    // Aggregate stats per vehicle along with the set of drivers who used
    // that vehicle today, so we can surface a recognisable name in the
    // primary slot instead of a plate / asset number.
    const byVehicle = new Map<
      string,
      { trips: number; distanceKm: number; drivers: Map<string, string> }
    >();
    for (const trip of trips) {
      const prev = byVehicle.get(trip.vehicleId) ?? {
        trips: 0,
        distanceKm: 0,
        drivers: new Map<string, string>(),
      };
      prev.trips += 1;
      if (typeof trip.distanceKm === "number" && Number.isFinite(trip.distanceKm)) {
        prev.distanceKm += trip.distanceKm;
      }
      if (trip.driver) {
        const name = `${trip.driver.firstName} ${trip.driver.lastName}`.trim();
        if (name) prev.drivers.set(trip.driver.id, name);
      }
      byVehicle.set(trip.vehicleId, prev);
    }
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    return [...byVehicle.entries()]
      .map(([id, stats]) => {
        const v = vehicleById.get(id);
        const plate = v?.plateNumber ?? v?.assetNumber ?? "Vehicle";
        const driverNames = [...stats.drivers.values()];
        const primary =
          driverNames.length === 0
            ? plate
            : driverNames.length === 1
              ? driverNames[0]
              : `${driverNames[0]} +${driverNames.length - 1}`;
        const secondary = driverNames.length === 0 ? null : plate;
        return {
          id,
          primary,
          secondary,
          trips: stats.trips,
          distanceKm: stats.distanceKm,
        };
      })
      .sort((a, b) => b.trips - a.trips || b.distanceKm - a.distanceKm)
      .slice(0, limit);
  }, [vehicles, trips, limit]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No vehicle activity today.
      </p>
    );
  }

  const maxTrips = Math.max(...rows.map((r) => r.trips), 1);

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-[140px_1fr_92px] items-center gap-2 text-xs"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-primary">{row.primary}</p>
            {row.secondary ? (
              <p className="truncate text-[10px] text-muted-foreground">
                {row.secondary}
              </p>
            ) : null}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(row.trips / maxTrips) * 100}%` }}
            />
          </div>
          <span className="text-right text-[11px] text-muted-foreground">
            {formatCount(row.trips)} trips
            {row.distanceKm > 0
              ? ` · ${formatCount(Math.round(row.distanceKm))} km`
              : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operations Today — aggregate ops figures derived purely from today's
// trip + attendance data.
// ---------------------------------------------------------------------------

function OperationsTodayPanel({
  trips,
  attendance,
}: {
  trips: ApiTrip[];
  attendance: ApiAttendanceDay[];
}) {
  const stats = useMemo(() => {
    const completed = trips.filter(
      (t) => t.status === "COMPLETED" && t.startedAt && t.completedAt,
    );
    const totalDistanceKm = trips.reduce((sum, trip) => {
      if (typeof trip.distanceKm === "number" && Number.isFinite(trip.distanceKm)) {
        return sum + trip.distanceKm;
      }
      return sum;
    }, 0);
    const totalDurationMs = completed.reduce((sum, trip) => {
      const start = new Date(trip.startedAt!).getTime();
      const end = new Date(trip.completedAt!).getTime();
      const dur = end - start;
      return dur > 0 && Number.isFinite(dur) ? sum + dur : sum;
    }, 0);
    const avgDurationMs =
      completed.length > 0 ? totalDurationMs / completed.length : 0;

    const activeDrivers = new Set(
      attendance
        .filter((d) => CHECKED_IN_STATUSES.has(d.status))
        .map((d) => d.driverId),
    ).size;

    const totalWorkKm = attendance.reduce((sum, day) => {
      const km = day.workDistanceKm ? Number(day.workDistanceKm) : NaN;
      return Number.isFinite(km) ? sum + km : sum;
    }, 0);

    return {
      tripCount: trips.length,
      completedCount: completed.length,
      totalDistanceKm,
      avgDurationMs,
      activeDrivers,
      totalWorkKm,
    };
  }, [trips, attendance]);

  const rows: Array<{
    icon: typeof Truck;
    label: string;
    value: string;
  }> = [
    {
      icon: Route,
      label: "Total trip distance",
      value: `${formatCount(Math.round(stats.totalDistanceKm))} km`,
    },
    {
      icon: Timer,
      label: "Avg completed trip",
      value: stats.completedCount > 0 ? formatElapsed(stats.avgDurationMs) : "—",
    },
    {
      icon: Gauge,
      label: "Shift distance (odometer)",
      value: `${formatCount(Math.round(stats.totalWorkKm))} km`,
    },
    {
      icon: Activity,
      label: "Active drivers right now",
      value: formatCount(stats.activeDrivers),
    },
  ];

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <li
            key={row.label}
            className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <Icon className="size-3.5 text-primary" />
              {row.label}
            </span>
            <span className="font-semibold text-primary">{row.value}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function SiteDashboard({ siteId }: { siteId: string }) {
  const [data, setData] = useState<SiteDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Hide the "Back to dashboard" breadcrumb for site-scoped users — they
  // have no org-wide /dashboard to return to (and clicking it would just
  // bounce them straight back here via the DashboardHomeGate redirect).
  const { user } = useAuth();
  const showBackToDashboard = !isScopedToSites(user);

  // Per-resource RBAC checks. The site dashboard mixes data from many
  // modules (vehicles, trips, fuel, …) and a reduced role such as
  // TIME_KEEPER only has access to a subset. We gate each fetch on the
  // relevant permission so a missing slug degrades that panel instead of
  // failing the whole page with "Missing permission(s): …".
  const canSiteHealth = hasPermission(user, "site-health.read");
  const canVehicles = hasPermission(user, "vehicles.read");
  const canTrips = hasPermission(user, "trips.read");
  const canAttendance = hasPermission(user, "attendance.read");
  const canFuel = hasPermission(user, "fuel.read");

  const today = useMemo(() => toLocalDateKey(new Date()), []);
  const historyFrom = useMemo(() => last7DayKeys(today)[0], [today]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        // getSite is the only fetch we treat as required — sites.read is
        // enforced by the PermissionGate wrapping this page, so failing
        // here is a genuine error worth surfacing. Every other fetch is
        // gated on its own permission and safely degrades to a no-op
        // fallback if the user lacks access (or the API returns 403).
        const [
          site,
          healthRows,
          history,
          vehicles,
          trips,
          attendance,
          fuel,
        ] = await Promise.all([
          getSite(siteId),
          canSiteHealth
            ? listSiteHealth(today, [siteId]).catch(
                ignoreForbidden([] as Awaited<ReturnType<typeof listSiteHealth>>),
              )
            : Promise.resolve([] as Awaited<ReturnType<typeof listSiteHealth>>),
          canSiteHealth
            ? listSiteHealthHistory(siteId, historyFrom, today).catch(
                ignoreForbidden(
                  [] as Awaited<ReturnType<typeof listSiteHealthHistory>>,
                ),
              )
            : Promise.resolve(
                [] as Awaited<ReturnType<typeof listSiteHealthHistory>>,
              ),
          canVehicles
            ? listVehiclesLookup().catch(
                ignoreForbidden(
                  [] as Awaited<ReturnType<typeof listVehiclesLookup>>,
                ),
              )
            : Promise.resolve(
                [] as Awaited<ReturnType<typeof listVehiclesLookup>>,
              ),
          canTrips
            ? listTrips({ date: today }).catch(
                ignoreForbidden([] as Awaited<ReturnType<typeof listTrips>>),
              )
            : Promise.resolve([] as Awaited<ReturnType<typeof listTrips>>),
          canAttendance
            ? listAttendanceRoster({ date: today, siteId }).catch(
                ignoreForbidden([] as ApiAttendanceDay[]),
              )
            : Promise.resolve([] as ApiAttendanceDay[]),
          canFuel
            ? listFuelConsumptionRoster({ date: today, siteId }).catch(
                ignoreForbidden([] as ApiFuelConsumptionDay[]),
              )
            : Promise.resolve([] as ApiFuelConsumptionDay[]),
        ]);

        if (cancelled) return;

        const snapshot = healthRows[0] ?? null;
        const byDate = new Map(history.map((row) => [row.date, row.score]));
        const historyScores = last7DayKeys(today).map(
          (key) => byDate.get(key) ?? null,
        );

        const siteVehicles = vehicles.filter((v) => v.siteId === siteId);
        const siteVehicleIds = new Set(siteVehicles.map((v) => v.id));
        const siteTrips = trips.filter((trip) =>
          siteVehicleIds.has(trip.vehicleId),
        );

        setData({
          site,
          snapshot,
          historyScores,
          vehicles: siteVehicles,
          trips: siteTrips,
          attendance,
          fuel,
          loadedAtMs: Date.now(),
        });
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load site");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [
    siteId,
    today,
    historyFrom,
    canSiteHealth,
    canVehicles,
    canTrips,
    canAttendance,
    canFuel,
  ]);

  if (isLoading) {
    return (
      <div className="fs-panel-in space-y-5">
        {showBackToDashboard && (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Back to dashboard
          </Link>
        )}
        <div className="h-8 w-64 animate-pulse rounded-md bg-slate-100" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fs-panel-in space-y-4">
        {showBackToDashboard && (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Back to dashboard
          </Link>
        )}
        <p className="text-sm text-destructive">{error ?? "Site not found."}</p>
      </div>
    );
  }

  const {
    site,
    snapshot,
    historyScores,
    vehicles,
    trips,
    attendance,
    fuel,
    loadedAtMs,
  } = data;
  const tone = statusTone(snapshot);
  const styles = TONE_STYLES[tone];
  const displayScore =
    snapshot && !snapshot.insufficientData ? snapshot.score : null;
  const conicScore = displayScore ?? 0;
  const conic = `conic-gradient(currentColor ${conicScore * 3.6}deg, #eef2f7 0deg)`;

  // KPI maths.
  const trucksOnSite = vehicles.filter(
    (v) => v.status === "ACTIVE" || v.status === "IDLE",
  ).length;
  const trucksInMaintenance = vehicles.filter(
    (v) => v.status === "IN_MAINTENANCE",
  ).length;
  const driversCheckedIn = new Set(
    attendance
      .filter((day) => CHECKED_IN_STATUSES.has(day.status))
      .map((day) => day.driverId),
  ).size;
  const driversExpected = attendance.filter(
    (day) => day.status !== "ON_LEAVE",
  ).length;
  const activeTrips = trips.filter((t) => t.status === "IN_PROGRESS").length;
  const completedTrips = trips.filter((t) => t.status === "COMPLETED").length;
  const delayedTrips = trips.filter(
    (t) =>
      t.status === "PLANNED" &&
      !!t.scheduledAt &&
      new Date(t.scheduledAt).getTime() < loadedAtMs,
  ).length;
  const fuelLitersToday = fuel.reduce((sum, day) => {
    const liters = day.estimatedLiters;
    return typeof liters === "number" && Number.isFinite(liters)
      ? sum + liters
      : sum;
  }, 0);

  return (
    <div className="fs-panel-in space-y-5">
      {showBackToDashboard && (
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="size-3.5" /> Back to dashboard
        </Link>
      )}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
            Site
          </p>
          <h1 className="font-headline-md text-headline-md text-dashboard-on-background">
            {site.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {site.address}, {site.city}, {site.state}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-bold",
            snapshot?.insufficientData
              ? "bg-slate-100 text-muted-foreground"
              : styles.soft,
          )}
        >
          {statusLabel(snapshot)}
        </span>
      </header>

      {/* KPI strip — same shape as the main dashboard, filtered to this site. */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetricTile
          label="Trucks on site"
          value={formatCount(trucksOnSite)}
          suffix={`| ${formatCount(vehicles.length)} total`}
          detail={
            trucksInMaintenance > 0
              ? `${formatCount(trucksInMaintenance)} in maintenance`
              : "All operational"
          }
          icon={Truck}
          tone="blue"
          index={0}
        />
        <MetricTile
          label="Drivers checked in"
          value={formatCount(driversCheckedIn)}
          suffix={`| ${formatCount(driversExpected)} expected`}
          detail={
            driversExpected > 0
              ? `${percentLabel(driversCheckedIn, driversExpected)} attendance`
              : "No roster today"
          }
          icon={Clock}
          tone={
            driversExpected > 0 && driversCheckedIn / driversExpected < 0.6
              ? "amber"
              : "green"
          }
          index={1}
        />
        <MetricTile
          label="Active trips"
          value={formatCount(activeTrips)}
          detail={
            completedTrips > 0
              ? `${formatCount(completedTrips)} completed today`
              : "Nothing wrapped yet"
          }
          icon={Route}
          tone="blue"
          index={2}
        />
        <MetricTile
          label="Fuel today"
          value={formatFuelLiters(fuelLitersToday)}
          detail={
            snapshot
              ? `Target reached: ${formatSiteHealthPercent(snapshot.trips.target > 0 ? Math.min(1, snapshot.trips.completed / snapshot.trips.target) : 0)}`
              : "Pending today's data"
          }
          icon={Fuel}
          tone="blue"
          index={3}
        />
        <MetricTile
          label="Trip delays"
          value={formatCount(delayedTrips)}
          detail={
            delayedTrips === 0 ? "On schedule" : "Planned trips past start time"
          }
          icon={Clock}
          tone={delayedTrips === 0 ? "blue" : "red"}
          index={4}
        />
      </section>

      {/* Health score + per-dimension breakdown + trip-status pie +
          driver attendance. Five-column grid on lg mirrors the KPI strip
          (donut 1 + breakdown 2 + trip status 1 + attendance 1). On sm
          (tablets / large phones) the grid is 2-wide so trip status and
          attendance naturally pair as a single row. */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="fs-card-in rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:col-span-2 lg:col-span-1">
          <p className="text-xs font-semibold text-muted-foreground">
            Today&apos;s health score
          </p>
          {/* On sm where this card spans the full row, lay the donut and
              the trend out horizontally so the extra width is actually
              used. On lg (narrow 1/5 column) we collapse back to a
              vertical stack. */}
          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-stretch sm:justify-around sm:gap-6 lg:flex-col lg:items-center lg:gap-3">
            <div
              className={cn(
                "grid size-28 shrink-0 place-items-center rounded-full p-3",
                styles.text,
              )}
              style={{ background: conic }}
            >
              <div className="grid size-20 place-items-center rounded-full bg-white">
                <span className="text-2xl font-bold leading-none text-primary">
                  {displayScore != null
                    ? `${formatSiteHealthScore(displayScore)}%`
                    : "—"}
                </span>
              </div>
            </div>
            <div className="flex w-full flex-col items-center justify-center gap-2 sm:max-w-sm lg:w-auto lg:max-w-none">
              <p className="text-xs text-muted-foreground">7-day trend</p>
              <TrendChart scores={historyScores} />
            </div>
          </div>
        </div>

        <div className="fs-card-in rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:col-span-2 lg:col-span-2">
          <p className="text-xs font-semibold text-muted-foreground">
            {siteHealthLabel("siteHealth.breakdown.title")}
          </p>
          {snapshot ? (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {DIMENSION_ROWS.map(({ key, labelKey }) => (
                <DimensionBar
                  key={key}
                  label={siteHealthLabel(labelKey)}
                  dim={snapshot.dimensions[key]}
                />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No score available for this site today.
            </p>
          )}
        </div>

        <div className="fs-card-in rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:col-span-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-primary">Trip Status (Today)</h2>
          </div>
          <TripStatusPie trips={trips} loadedAtMs={loadedAtMs} />
        </div>

        <div className="fs-card-in rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:col-span-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-primary">Driver Attendance</h2>
            <span className="text-[11px] font-semibold text-muted-foreground">
              Today
            </span>
          </div>
          <AttendanceBreakdown days={attendance} />
        </div>
      </section>

      {/* Bottom row: Fuel by driver + live activity feed. */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-4">
        <div className="fs-card-in rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-primary">Fuel Usage (Today)</h2>
            <span className="text-[11px] font-semibold text-muted-foreground">
              By Driver
            </span>
          </div>
          <FuelByDriver rows={fuel} />
        </div>

        <div className="fs-card-in rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-primary">
              <Activity className="size-4" />
              Recent Activity
            </h2>
            <span className="text-[11px] font-semibold text-muted-foreground">
              Today
            </span>
          </div>
          <RecentActivityCard trips={trips} attendance={attendance} />
        </div>
      </section>

      {/* Fleet + tactical operational data. 4-column grid: vehicle status
          (1) + on-the-road list (2) + operations summary (1). */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-4">
        <div className="fs-card-in rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-primary">
              <Truck className="size-4" />
              Vehicle Status
            </h2>
            <span className="text-[11px] font-semibold text-muted-foreground">
              {formatCount(vehicles.length)} assigned
            </span>
          </div>
          <VehicleStatusPanel vehicles={vehicles} />
        </div>

        <div className="fs-card-in rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-primary">
              <MapPin className="size-4" />
              On The Road Now
            </h2>
            <span className="text-[11px] font-semibold text-muted-foreground">
              Live
            </span>
          </div>
          <ActiveTripsPanel trips={trips} loadedAtMs={loadedAtMs} />
        </div>

        <div className="fs-card-in rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm xl:col-span-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-primary">
              <Gauge className="size-4" />
              Operations Today
            </h2>
          </div>
          <OperationsTodayPanel trips={trips} attendance={attendance} />
        </div>
      </section>

      {/* Workload distribution — surfaces underused vs. workhorse trucks. */}
      <section className="fs-card-in rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-primary">
            <Truck className="size-4" />
            Top Vehicles Today
          </h2>
          <span className="text-[11px] font-semibold text-muted-foreground">
            By trip count
          </span>
        </div>
        <TopVehiclesPanel vehicles={vehicles} trips={trips} />
      </section>
    </div>
  );
}
