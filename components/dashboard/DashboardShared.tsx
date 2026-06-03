"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Loader2, RotateCcw } from "@/lib/icons";

import { Button } from "@/components/ui/button";

import {
  useSitesOverview,
  type SiteOverviewRow,
} from "@/components/dashboard/useSitesOverview";
import { staggerStyle } from "@/lib/animations";
import { listFuelConsumptionRosterBulk } from "@/lib/api/fuel";
import { ignoreForbidden } from "@/lib/api/ignoreForbidden";
import { listMySites } from "@/lib/api/sites";
import { listTrips } from "@/lib/api/trips";
import { hasPermission, type ApiTrip, SiteHealthStatusBand } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  formatCount,
  formatFuelLiters,
  formatSiteHealthScore,
} from "@/lib/site-health/format";
import { siteHealthLabel } from "@/lib/site-health/labels";
import { toLocalDateKey } from "@/lib/trips/tripFormatters";
import { cn } from "@/lib/utils";

type Tone = "blue" | "green" | "amber" | "red" | "purple";

const TONE_STYLES: Record<
  Tone,
  { soft: string; text: string; bar: string; ring: string }
> = {
  blue: {
    soft: "bg-primary/10 text-primary",
    text: "text-primary",
    bar: "bg-primary",
    ring: "border-primary/15",
  },
  green: {
    soft: "bg-success/15 text-success",
    text: "text-success",
    bar: "bg-success",
    ring: "border-success/20",
  },
  amber: {
    soft: "bg-amber-100 text-amber-700",
    text: "text-amber-700",
    bar: "bg-amber-500",
    ring: "border-amber-200",
  },
  red: {
    soft: "bg-destructive/10 text-destructive",
    text: "text-destructive",
    bar: "bg-destructive",
    ring: "border-destructive/20",
  },
  purple: {
    soft: "bg-violet-100 text-violet-700",
    text: "text-violet-700",
    bar: "bg-violet-500",
    ring: "border-violet-200",
  },
};

function cardClass(className?: string) {
  return cn(
    "fs-card-in rounded-2xl border border-slate-200/80 bg-white shadow-sm",
    className,
  );
}

function panelMessage(message: string, tone: "muted" | "error" = "muted") {
  return (
    <p className={cn("text-sm", tone === "error" ? "text-destructive" : "text-muted-foreground")}>
      {message}
    </p>
  );
}

function percentLabel(count: number, total: number): string {
  if (total <= 0) return "0%";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(count / total);
}

function isDelayedTrip(trip: ApiTrip, now: number): boolean {
  return (
    trip.status === "PLANNED" &&
    !!trip.scheduledAt &&
    new Date(trip.scheduledAt).getTime() < now
  );
}

function SectionHeader({
  title,
  action,
  extra,
}: {
  title: string;
  action?: string;
  /** Optional slot rendered to the right of the action (e.g. refresh button). */
  extra?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-bold text-primary">{title}</h2>
      <div className="flex items-center gap-3">
        {action ? (
          <button
            type="button"
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            {action}
          </button>
        ) : null}
        {extra}
      </div>
    </div>
  );
}

// Primary refresh button used by dashboard panels that need a manual
// data-pull affordance.
function RefreshAffordance({
  onRefresh,
  isRefreshing,
}: {
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  return (
    <Button
      type="button"
      onClick={onRefresh}
      disabled={isRefreshing}
      className="h-9 shrink-0 gap-2 rounded-xl bg-primary px-3 text-xs font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
    >
      {isRefreshing ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <RotateCcw className="size-3.5" />
      )}
      Refresh
    </Button>
  );
}

export function MetricCard({
  label,
  value,
  suffix,
  detail,
  icon: Icon,
  tone,
  index,
  compact = false,
}: {
  label: string;
  value: string;
  suffix?: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  tone: Tone;
  index: number;
  compact?: boolean;
}) {
  const styles = TONE_STYLES[tone];

  return (
    <div
      className={cardClass(cn("p-4", compact ? "min-h-32" : "min-h-28"))}
      style={staggerStyle(index)}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className={cn("flex size-10 items-center justify-center rounded-xl", styles.soft)}>
          <Icon className="size-4" />
        </span>
        <span className={cn("h-1.5 w-10 rounded-full", styles.bar)} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-primary">{value}</span>
        {suffix ? (
          <span className="text-xs font-semibold text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs font-semibold text-primary">{label}</p>
      <p className={cn("mt-2 text-[11px]", styles.text)}>{detail}</p>
    </div>
  );
}

function statusTone(status: SiteHealthStatusBand | null): Tone {
  switch (status) {
    case "GOOD":
      return "green";
    case "WATCH":
      return "amber";
    case "CRITICAL":
      return "red";
    default:
      return "blue";
  }
}

function statusLabel(
  site: SiteOverviewRow,
): string {
  if (site.insufficientData) {
    return siteHealthLabel("siteHealth.status.insufficient");
  }
  switch (site.status) {
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

function ScoreSparkline({ scores }: { scores: (number | null)[] }) {
  const valid = scores.filter((s): s is number => s != null && Number.isFinite(s));
  if (valid.length < 2) return null;

  const w = 100;
  const h = 24;
  const min = Math.min(...valid, 0);
  const max = Math.max(...valid, 100);
  const range = max - min || 1;

  const points = scores
    .map((score, i) => {
      if (score == null || !Number.isFinite(score)) return null;
      const x = (i / (scores.length - 1)) * w;
      const y = h - ((score - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");

  if (!points) return null;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="mt-2 h-6 w-full text-primary"
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

export function SiteScoreCard({
  site,
  index,
}: {
  site: SiteOverviewRow;
  index: number;
}) {
  const tone = site.insufficientData ? "blue" : statusTone(site.status);
  const statusStyles = TONE_STYLES[tone];
  const displayScore = site.insufficientData ? null : site.score;
  const ringPct = displayScore ?? 0;
  const conic = `conic-gradient(currentColor ${ringPct * 3.6}deg, #eef2f7 0deg)`;

  return (
    <Link
      href={`/sites/${site.siteId}`}
      className="fs-row-in block rounded-xl border border-primary/15 bg-white p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      style={staggerStyle(index)}
      aria-label={`Open ${site.name} site dashboard`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {index + 1}
          </span>
          <p className="truncate text-lg font-bold tracking-tight text-primary">
            {site.name}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
            site.insufficientData
              ? "bg-slate-100 text-muted-foreground"
              : statusStyles.soft,
          )}
        >
          {statusLabel(site)}
        </span>
      </div>
      <div className="flex items-center justify-center">
        <div
          className="grid size-20 place-items-center rounded-full p-2 text-primary"
          style={{ background: conic }}
        >
          <div className="grid size-14 place-items-center rounded-full bg-white">
            <span className="text-lg font-bold leading-none text-primary">
              {displayScore != null
                ? `${formatSiteHealthScore(displayScore)}%`
                : "—"}
            </span>
          </div>
        </div>
      </div>
      <ScoreSparkline scores={site.historyScores} />
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] text-muted-foreground">
        <span>
          <span className="block font-semibold text-primary">
            {formatCount(site.trucks.onsite)}
          </span>
          {siteHealthLabel("siteHealth.trucksOnSite")}
        </span>
        <span>
          <span className="block font-semibold text-primary">
            {formatCount(site.trips.completed)}
          </span>
          {siteHealthLabel("siteHealth.tripsToday")}
        </span>
        <span>
          <span className="block font-semibold text-primary">
            {formatFuelLiters(site.fuel.liters)}
          </span>
          {siteHealthLabel("siteHealth.fuelToday")}
        </span>
      </div>
    </Link>
  );
}

export function SitesOverviewPanel({ compact = false }: { compact?: boolean }) {
  const { sites, isLoading, isRefreshing, error, hasAssignments, refresh } =
    useSitesOverview();

  return (
    <section className={cardClass("p-4")}>
      <SectionHeader
        title={`Sites (${sites.length || "…"}) Overview`}
        action="View all sites"
        extra={
          <RefreshAffordance onRefresh={refresh} isRefreshing={isRefreshing} />
        }
      />
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : isLoading ? (
        <div className={cn("grid gap-3", compact ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4" : "grid-cols-2 xl:grid-cols-5")}>
          {Array.from({ length: compact ? 4 : 5 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl bg-slate-100"
              style={staggerStyle(i)}
            />
          ))}
        </div>
      ) : !hasAssignments ? (
        <p className="text-sm text-muted-foreground">
          You have no site assignments. Ask an admin to assign you to a site.
        </p>
      ) : sites.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sites in scope.</p>
      ) : (
        <div
          className={cn(
            "grid gap-3",
            compact
              ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
              : "grid-cols-2 xl:grid-cols-5",
          )}
        >
          {sites.map((site, index) => (
            <SiteScoreCard key={site.siteId} site={site} index={index} />
          ))}
        </div>
      )}
    </section>
  );
}

export function FuelUsagePanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Array<{ site: string; liters: number; pct: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        if (!hasPermission(user, "fuel.read")) {
          if (!cancelled) {
            setRows([]);
            setError(null);
          }
          return;
        }

        const today = toLocalDateKey(new Date());
        const sites = hasPermission(user, "sites.read")
          ? await listMySites().catch(ignoreForbidden([]))
          : [];
        const siteIds = sites.map((site) => site.id);
        const nameById = new Map(sites.map((site) => [site.id, site.name]));

        if (siteIds.length === 0) {
          if (!cancelled) {
            setRows([]);
            setError(null);
          }
          return;
        }

        const roster = await listFuelConsumptionRosterBulk({
          date: today,
          siteIds,
        }).catch(ignoreForbidden({ bySite: {} }));
        const bySite = Object.entries(roster.bySite).map(([siteId, days]) => ({
          site: nameById.get(siteId) ?? days[0]?.site?.name ?? "Unknown site",
          liters: days.reduce((sum, day) => {
            const liters = day.estimatedLiters;
            return typeof liters === "number" && Number.isFinite(liters)
              ? sum + liters
              : sum;
          }, 0),
        }));
        const topRows = bySite
          .sort((a, b) => b.liters - a.liters)
          .slice(0, 5);
        const maxLiters = Math.max(...topRows.map((row) => row.liters), 1);

        if (!cancelled) {
          setRows(
            topRows.map((row) => ({
              ...row,
              pct: Math.max(3, (row.liters / maxLiters) * 100),
            })),
          );
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load fuel usage");
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

  return (
    <section className={cardClass("p-4")}>
      <SectionHeader title="Fuel Usage (Today)" action="By Site" />
      {error
        ? panelMessage(error, "error")
        : isLoading
          ? panelMessage("Loading fuel usage...")
          : rows.length === 0
            ? panelMessage("No fuel data recorded today.")
            : (
              <div className="space-y-2">
                {rows.map((item) => (
                  <div key={item.site} className="grid grid-cols-[82px_1fr_72px] items-center gap-2 text-xs">
                    <span className="truncate font-medium text-primary">{item.site}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                    <span className="text-right text-[11px] text-muted-foreground">
                      {formatFuelLiters(item.liters)}
                    </span>
                  </div>
                ))}
              </div>
            )}
    </section>
  );
}

export function TripStatusPanel() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<ApiTrip[]>([]);
  const [loadedAtMs, setLoadedAtMs] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const today = toLocalDateKey(new Date());
        const rows = hasPermission(user, "trips.read")
          ? await listTrips({ date: today }).catch(ignoreForbidden([] as ApiTrip[]))
          : [];
        if (!cancelled) {
          setTrips(rows);
          setLoadedAtMs(Date.now());
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load trip status");
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

  const statusRows = useMemo(() => {
    const total = trips.length;
    const completed = trips.filter((trip) => trip.status === "COMPLETED").length;
    const inProgress = trips.filter((trip) => trip.status === "IN_PROGRESS").length;
    const delayed = trips.filter((trip) => isDelayedTrip(trip, loadedAtMs)).length;
    const cancelled = trips.filter((trip) => trip.status === "CANCELLED").length;
    return {
      total,
      rows: [
        { label: "Completed", count: completed, swatch: "bg-primary" },
        { label: "In Progress", count: inProgress, swatch: "bg-primary/40" },
        { label: "Delayed", count: delayed, swatch: "bg-amber-500" },
        { label: "Cancelled", count: cancelled, swatch: "bg-destructive" },
      ],
    };
  }, [trips, loadedAtMs]);

  const [completedRow, inProgressRow, delayedRow] = statusRows.rows;
  const completedDeg = statusRows.total ? (completedRow.count / statusRows.total) * 360 : 0;
  const progressDeg = statusRows.total ? (inProgressRow.count / statusRows.total) * 360 : 0;
  const delayedDeg = statusRows.total ? (delayedRow.count / statusRows.total) * 360 : 0;
  const conic = `conic-gradient(var(--palette-primary) 0 ${completedDeg}deg, color-mix(in_srgb,var(--palette-primary)_40%,white) ${completedDeg}deg ${completedDeg + progressDeg}deg, #f59e0b ${completedDeg + progressDeg}deg ${completedDeg + progressDeg + delayedDeg}deg, var(--palette-negative) ${completedDeg + progressDeg + delayedDeg}deg 360deg)`;

  return (
    <section className={cardClass("p-4")}>
      <SectionHeader title="Trip Status (Today)" />
      {error
        ? panelMessage(error, "error")
        : isLoading
          ? panelMessage("Loading trip status...")
          : (
            <div className="grid grid-cols-[120px_1fr] items-center gap-4">
              <div
                className="grid size-28 place-items-center rounded-full p-4"
                style={{ background: statusRows.total > 0 ? conic : "#f1f5f9" }}
              >
                <div className="grid size-20 place-items-center rounded-full bg-white text-center">
                  <span className="text-xl font-bold text-primary">
                    {formatCount(statusRows.total)}
                  </span>
                  <span className="-mt-3 text-[10px] text-muted-foreground">Total Trips</span>
                </div>
              </div>
              <div className="space-y-2">
                {statusRows.rows.map((status) => (
                  <div key={status.label} className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className={cn("size-2 rounded-full", status.swatch)} />
                      {status.label}
                    </span>
                    <span className="font-semibold text-primary">
                      {formatCount(status.count)}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({percentLabel(status.count, statusRows.total)})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
    </section>
  );
}

export function SitePerformancePanel() {
  const { sites, isLoading, error } = useSitesOverview();
  const rows = useMemo(
    () =>
      [...sites]
        .filter((site) => site.score != null && !site.insufficientData)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 5),
    [sites],
  );

  return (
    <section className={cardClass("p-4")}>
      <SectionHeader title="Site Performance" />
      {error
        ? panelMessage(error, "error")
        : isLoading
          ? panelMessage("Loading site performance...")
          : rows.length === 0
            ? panelMessage("No scored site performance available yet.")
            : (
              <div className="space-y-2">
                {rows.map((site) => {
                  const tone = statusTone(site.status);
                  const styles = TONE_STYLES[tone];
                  const score = site.score ?? 0;
                  return (
                    <div key={site.siteId} className="grid grid-cols-[92px_48px_1fr_52px] items-center gap-2 text-xs">
                      <span className="truncate font-semibold text-primary">{site.name}</span>
                      <span className="text-muted-foreground">{formatSiteHealthScore(score)}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={cn("h-full rounded-full", styles.bar)} style={{ width: `${score}%` }} />
                      </div>
                      <span className="text-right text-muted-foreground">
                        {formatCount(site.trips.completed)} trips
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
      <Link href="/trips" className="mt-4 inline-flex text-xs font-semibold text-primary hover:underline">
        View full performance
      </Link>
    </section>
  );
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
