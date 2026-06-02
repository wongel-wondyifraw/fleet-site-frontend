"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ChevronDown,
  Fuel,
  Loader2,
  Truck,
} from "@/lib/icons";

import { ApiError } from "@/lib/api/client";
import { getDriverFuelHistory, type DriverFuelHistory } from "@/lib/api/fuel";
import { staggerStyle } from "@/lib/animations";
import type {
  ApiDriver,
  ApiFuelConsumptionDay,
  ApiFuelOdometerSummary,
  ApiTimeSettings,
} from "@/lib/api/types";
import {
  CONSUMPTION_ISSUE_LABELS,
  computeRosterTotals,
  consumptionIssues,
  formatEstimatedLiters,
  formatKmPerLitre,
  isDistanceIncomplete,
  parseWorkDistanceKm,
  vehicleLabel,
} from "@/lib/fuel/fuelHelpers";
import { formatDate } from "@/lib/time/format";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import { cn } from "@/lib/utils";

const RANGE_PRESETS: { id: "7" | "30" | "90"; label: string; days: number }[] = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
];

function toDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date: Date, delta: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + delta);
  return copy;
}

function driverDisplayName(driver: ApiDriver | null): string {
  if (!driver) return "Unknown driver";
  const composed = `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim();
  return composed || driver.employeeId || "Unnamed driver";
}

function fullDateLabel(dateKey: string, settings: ApiTimeSettings): string {
  return formatDate(`${dateKey}T00:00:00`, settings, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DriverFuelDetail({ driverId }: { driverId: string }) {
  const { settings } = useTimeSettings();
  const [rangePreset, setRangePreset] = useState<"7" | "30" | "90" | "CUSTOM">(
    "30",
  );
  const [customFrom, setCustomFrom] = useState(() =>
    toDateKey(addDays(new Date(), -29)),
  );
  const [customTo, setCustomTo] = useState(() => toDateKey(new Date()));
  const [driver, setDriver] = useState<ApiDriver | null>(null);
  const [days, setDays] = useState<ApiFuelConsumptionDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const historyCacheRef = useRef<Map<string, DriverFuelHistory>>(new Map());

  const range = useMemo(() => {
    if (rangePreset === "CUSTOM") {
      return { from: customFrom, to: customTo };
    }
    const preset = RANGE_PRESETS.find((p) => p.id === rangePreset);
    const span = preset?.days ?? 30;
    const today = new Date();
    return {
      from: toDateKey(addDays(today, -(span - 1))),
      to: toDateKey(today),
    };
  }, [rangePreset, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `${driverId}:${range.from}:${range.to}`;
    const cached = historyCacheRef.current.get(cacheKey);
    if (cached) {
      setDriver(cached.driver);
      setDays(cached.days);
      setLoadError(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const result = await getDriverFuelHistory(driverId, range);
        if (cancelled) return;
        historyCacheRef.current.set(cacheKey, result);
        setDriver(result.driver);
        setDays(result.days);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Unable to load fuel usage history.",
        );
        setDays([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [driverId, range]);

  const totals = useMemo(() => computeRosterTotals(days), [days]);
  const vehicleSnapshot =
    days[0]?.vehicle ??
    (driver?.assignedVehicle
      ? {
          id: driver.assignedVehicle.id,
          plateNumber: driver.assignedVehicle.plateNumber,
          assetNumber: driver.assignedVehicle.assetNumber,
          mileage: driver.assignedVehicle.mileage,
          fuelType: driver.assignedVehicle.fuelType,
        }
      : null);

  const headerVehicleLabel = vehicleSnapshot
    ? vehicleSnapshot.assetNumber
      ? `${vehicleSnapshot.assetNumber} · ${vehicleSnapshot.plateNumber}`
      : vehicleSnapshot.plateNumber
    : "—";

  const avgLitersPerDay =
    totals.rowsWithEstimate > 0
      ? Number((totals.totalLiters / totals.rowsWithEstimate).toFixed(2))
      : 0;

  const ratedKmPerL =
    days.find((d) => d.ratedKmPerLitre != null && d.ratedKmPerLitre > 0)
      ?.ratedKmPerLitre ??
    driver?.assignedVehicle?.mileage ??
    null;

  const sortedDays = useMemo(
    () => [...days].sort((a, b) => b.date.localeCompare(a.date)),
    [days],
  );

  return (
    <div className="space-y-5 fs-panel-in">
      <Link
        href="/fuel"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        Back to fuel management
      </Link>

      <header className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
              {driver?.firstName?.[0] ?? "?"}
              {driver?.lastName?.[0] ?? ""}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-primary">
                {driverDisplayName(driver)}
              </h1>
              <p className="text-xs text-muted-foreground">
                {driver?.employeeId ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/5 px-2.5 py-1.5 font-semibold text-primary">
              <Truck className="size-3.5" />
              {headerVehicleLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/5 px-2.5 py-1.5 font-semibold text-primary">
              <Fuel className="size-3.5" />
              Rated {formatKmPerLitre(ratedKmPerL)}
            </span>
          </div>
        </div>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
        <p className="font-label-caps mb-3 text-[10px] tracking-wide text-muted-foreground uppercase">
          Date range
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setRangePreset(preset.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                rangePreset === preset.id
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "bg-primary/5 text-primary/80 hover:bg-primary/10 hover:text-primary",
              )}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRangePreset("CUSTOM")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              rangePreset === "CUSTOM"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "bg-primary/5 text-primary/80 hover:bg-primary/10 hover:text-primary",
            )}
          >
            Custom
          </button>
        </div>
        {rangePreset === "CUSTOM" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Calendar className="size-4 text-muted-foreground" />
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-primary focus:border-primary/40 focus:outline-none"
            />
            <span className="text-muted-foreground">→</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-primary focus:border-primary/40 focus:outline-none"
            />
          </div>
        )}
      </div>

      {loadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2.5 text-sm text-rose-800">
          {loadError}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-10">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total distance" value={`${totals.totalKm.toFixed(1)} km`} />
            <StatCard
              label="Total est. fuel"
              value={formatEstimatedLiters(totals.totalLiters)}
              highlight
            />
            <StatCard
              label="Avg est. / day"
              value={formatEstimatedLiters(avgLitersPerDay)}
            />
            <StatCard
              label="Days with data"
              value={`${totals.rowsWithEstimate} / ${days.length}`}
              sub={
                totals.rowsMissingData > 0
                  ? `${totals.rowsMissingData} missing odometer or rating`
                  : undefined
              }
            />
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-primary">Daily breakdown</h2>
            {sortedDays.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-sm text-muted-foreground">
                No fuel usage records in this date range.
              </div>
            ) : (
              <ul className="grid gap-2">
                {sortedDays.map((day, index) => (
                  <FuelDayRow
                    key={day.attendanceDayId}
                    day={day}
                    settings={settings}
                    style={staggerStyle(index)}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        highlight
          ? "border-emerald-200 bg-emerald-50/60"
          : "border-slate-200 bg-white",
      )}
    >
      <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-bold tabular-nums",
          highlight ? "text-emerald-800" : "text-primary",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-amber-700">{sub}</p>}
    </div>
  );
}

function FuelDayRow({
  day,
  settings,
  style,
}: {
  day: ApiFuelConsumptionDay;
  settings: ApiTimeSettings;
  style?: React.CSSProperties;
}) {
  const [expanded, setExpanded] = useState(false);
  const distanceKm = parseWorkDistanceKm(day.workDistanceKm);
  const hasDistance = distanceKm != null;
  const distanceIncomplete = isDistanceIncomplete(day);
  const issues = consumptionIssues(day);
  const hasEstimate =
    day.estimatedLiters != null && Number.isFinite(day.estimatedLiters);
  const panelId = `fuel-day-${day.attendanceDayId}`;

  return (
    <li
      style={style}
      className={cn(
        "overflow-hidden rounded-xl border bg-slate-50/50 transition-colors",
        expanded ? "border-primary/20 ring-1 ring-primary/10" : "border-slate-100",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full flex-col gap-3 p-3 text-left transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg bg-white text-primary ring-1 ring-slate-100">
            <span className="text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
              {formatDate(`${day.date}T00:00:00`, settings, { month: "short" })}
            </span>
            <span className="-mt-0.5 text-sm font-bold leading-none tabular-nums">
              {formatDate(`${day.date}T00:00:00`, settings, { day: "numeric" })}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-primary">
              {fullDateLabel(day.date, settings)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {day.site?.name ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {hasDistance && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/5 px-2.5 py-1 text-[11px] font-bold text-primary">
              {distanceKm.toFixed(1)} km
              {distanceIncomplete ? "*" : null}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
              hasEstimate
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-500",
            )}
          >
            <Fuel className="size-3" />
            {formatEstimatedLiters(day.estimatedLiters)}
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </div>
      </button>

      {expanded && (
        <div
          id={panelId}
          className="border-t border-slate-100 bg-white/60 px-3 pb-3 pt-3"
        >
          {issues.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {issues.map((issue) => (
                <span
                  key={issue}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase ring-1 ring-amber-300/60"
                >
                  <AlertTriangle className="size-2.5" />
                  {CONSUMPTION_ISSUE_LABELS[issue]}
                </span>
              ))}
            </div>
          )}
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <DetailItem label="Rated km/L" value={formatKmPerLitre(day.ratedKmPerLitre)} />
            <DetailItem label="Work distance" value={hasDistance ? `${distanceKm.toFixed(2)} km` : "—"} />
            <DetailItem label="Estimated consumption" value={formatEstimatedLiters(day.estimatedLiters)} />
            <DetailItem label="Vehicle" value={vehicleLabel(day)} />
          </dl>
          {day.odometerSummary && (
            <OdometerSummaryBlock summary={day.odometerSummary} />
          )}
        </div>
      )}
    </li>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-2">
      <dt className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 font-semibold text-primary">{value}</dd>
    </div>
  );
}

function OdometerSummaryBlock({ summary }: { summary: ApiFuelOdometerSummary }) {
  const entries: { label: string; value: number | null | undefined }[] = [
    { label: "Day in", value: summary.dayIn },
    { label: "Lunch out", value: summary.lunchOut },
    { label: "Lunch in", value: summary.lunchIn },
    { label: "Day out", value: summary.dayOut },
  ];

  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
      <p className="mb-2 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
        Odometer readings (km)
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {entries.map(({ label, value }) => (
          <div key={label} className="text-center">
            <p className="text-[9px] font-bold text-muted-foreground uppercase">{label}</p>
            <p className="text-sm font-bold tabular-nums text-primary">
              {value != null && Number.isFinite(value) ? value.toFixed(1) : "—"}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Distance = (Lunch out − Day in) + (Day out − Lunch in), or Day out − Day in when lunch is skipped.
      </p>
    </div>
  );
}
