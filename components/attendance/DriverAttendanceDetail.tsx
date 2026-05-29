"use client";

// Per-driver attendance detail page. Reuses the visual language of the
// attendance management list (rounded cards, soft slate backgrounds,
// primary accent) so the user immediately recognises where they are.
// Colour usage is intentionally restrained: the page leans on blue /
// primary tones with green and red used sparingly for "good" and "bad"
// signals respectively.
//
// Page is structured top-to-bottom as:
//   1. Back link + driver header
//   2. Date-range picker + "late after" knob
//   3. Stat cards (absent / late / missed check-in / missed check-out + worked hours)
//   4. Performance line chart (days × worked hours)
//   5. Day-by-day breakdown list
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  Coffee,
  LogIn,
  LogOut,
  Loader2,
  Wrench,
  X,
} from "@/lib/icons";

import { ApiError } from "@/lib/api/client";
import { getDriverAttendanceHistory } from "@/lib/api/attendance";
import type {
  ApiAttendanceDay,
  ApiAttendancePunch,
  ApiDriver,
  AttendanceDayStatus,
  AttendancePunchType,
} from "@/lib/api/types";
import {
  DEFAULT_TARGET_HOURS,
  readStoredTargets,
  targetHoursForDate,
  type TargetHoursMap,
} from "@/lib/attendance-targets";
import { cn } from "@/lib/utils";

// Status pill palette. Restricted to the blue / green / red family the
// rest of the page uses; ON_BREAK and ON_LEAVE intentionally read as
// "blue" (informational) rather than amber/orange so the page stays
// monochromatic except where signal really matters.
const STATUS_STYLES: Record<AttendanceDayStatus, string> = {
  EXPECTED: "bg-blue-50 text-blue-700",
  PRESENT: "bg-blue-50 text-blue-700",
  ON_BREAK: "bg-blue-50 text-blue-700",
  DONE: "bg-emerald-50 text-emerald-700",
  ABSENT: "bg-rose-50 text-rose-700",
  ON_LEAVE: "bg-slate-100 text-slate-700",
};

const AUTO_CLOSE_REASON_LABELS: Record<string, string> = {
  MISSING_DAY_OUT: "No day out",
  MISSING_LUNCH_RETURN: "Afternoon absent",
  MISSING_MAINT_RETURN: "Maint not closed",
};

const RANGE_PRESETS: { id: "7" | "30" | "90"; label: string; days: number }[] = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
];

// Driver is "late" when their first DAY_IN of the day is after this
// HH:MM local time. Kept in component state so the user can tune it
// without a redeploy; the default mirrors a standard 8:00 start with a
// 30-minute grace window.
const DEFAULT_LATE_AFTER = "08:30";

const PUNCH_LABELS: Record<AttendancePunchType, string> = {
  DAY_IN: "Day in",
  DAY_OUT: "Day out",
  LUNCH_OUT: "Lunch out",
  LUNCH_IN: "Lunch in",
  MAINT_OUT: "Maint out",
  MAINT_IN: "Maint in",
};

// ---------------------------------------------------------------------------
// Date helpers (server stores YYYY-MM-DD strings; we keep the same shape so
// comparisons against day.date stay string-based and timezone-safe).
// ---------------------------------------------------------------------------

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

// Generate every YYYY-MM-DD between from and to (inclusive). Used to back
// the chart's x-axis so days with no roster entry still show as a "gap"
// instead of being silently collapsed.
function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  for (let d = start; d <= end; d = addDays(d, 1)) {
    out.push(toDateKey(d));
  }
  return out;
}

function shortDateLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fullDateLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPunchTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Punch-driven derivations. Kept identical to AttendanceManagement so the
// numbers shown on this page match the ones the timekeeper sees while
// punching in.
// ---------------------------------------------------------------------------

function liveSortedPunches(day: ApiAttendanceDay): ApiAttendancePunch[] {
  return [...(day.punches ?? [])]
    .filter((p) => !p.isVoided)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function firstPunchOfType(
  punches: ApiAttendancePunch[],
  type: AttendancePunchType,
): ApiAttendancePunch | null {
  for (const p of punches) {
    if (p.type === type) return p;
  }
  return null;
}

function lastPunchOfType(
  punches: ApiAttendancePunch[],
  type: AttendancePunchType,
): ApiAttendancePunch | null {
  for (let i = punches.length - 1; i >= 0; i -= 1) {
    if (punches[i].type === type) return punches[i];
  }
  return null;
}

// Worked hours = (DAY_OUT - DAY_IN) - sum(break windows). Same shape as
// AttendanceManagement.computeWorkedHours, simplified here because the
// detail page never renders an in-progress "now" indicator.
function computeWorkedHours(day: ApiAttendanceDay): number {
  const punches = liveSortedPunches(day);
  const dayIn = firstPunchOfType(punches, "DAY_IN");
  const dayOut = lastPunchOfType(punches, "DAY_OUT");
  if (!dayIn || !dayOut) return 0;
  const start = new Date(dayIn.at).getTime();
  const end = new Date(dayOut.at).getTime();
  if (end <= start) return 0;

  let breakMs = 0;
  for (const pair of [
    { outType: "LUNCH_OUT", inType: "LUNCH_IN" } as const,
    { outType: "MAINT_OUT", inType: "MAINT_IN" } as const,
  ]) {
    let openAt: number | null = null;
    for (const p of punches) {
      if (p.type === pair.outType) {
        openAt = new Date(p.at).getTime();
      } else if (p.type === pair.inType && openAt !== null) {
        breakMs += Math.max(0, new Date(p.at).getTime() - openAt);
        openAt = null;
      }
    }
  }
  return Math.max(0, (end - start - breakMs) / (1000 * 60 * 60));
}

// HH:MM string -> minutes after midnight, used to compare punch times
// against the user-configurable "late after" threshold.
function timeStringToMinutes(value: string): number | null {
  const [hh, mm] = value.split(":").map((s) => Number.parseInt(s, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function punchMinutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DerivedStats {
  // The presented count: rows in the range that the driver was scheduled
  // for (i.e. not ON_LEAVE). Used as the denominator for averages so a
  // planned day off doesn't drag the worked-hours mean down.
  scheduledDays: number;
  workedDays: number;
  absentDays: number;
  onLeaveDays: number;
  lateDays: number;
  missedCheckInDays: number;
  missedCheckOutDays: number;
  autoClosedDays: number;
  totalWorkedHours: number;
  averageWorkedHours: number;
}

export function DriverAttendanceDetail({ driverId }: { driverId: string }) {
  const [rangePreset, setRangePreset] = useState<"7" | "30" | "90" | "CUSTOM">(
    "30",
  );
  const [customFrom, setCustomFrom] = useState<string>(() =>
    toDateKey(addDays(new Date(), -29)),
  );
  const [customTo, setCustomTo] = useState<string>(() => toDateKey(new Date()));
  const [lateAfter, setLateAfter] = useState<string>(DEFAULT_LATE_AFTER);
  // Per-day target hours are sourced from the same localStorage map the
  // attendance management page writes to, so a "6h" override applied
  // there flows through to this page's stats and chart automatically.
  const [targetHoursMap, setTargetHoursMap] = useState<TargetHoursMap>(
    () => readStoredTargets(),
  );

  const [driver, setDriver] = useState<ApiDriver | null>(null);
  const [days, setDays] = useState<ApiAttendanceDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Keep the target-hours map fresh: re-read it whenever the tab regains
  // focus (the management page might've edited it in another tab) and
  // also listen for storage events from other tabs. Cheap and avoids a
  // stale chart line after the user tweaks a day's target elsewhere.
  useEffect(() => {
    function reload() {
      setTargetHoursMap(readStoredTargets());
    }
    window.addEventListener("focus", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("focus", reload);
      window.removeEventListener("storage", reload);
    };
  }, []);

  // Compute the effective range from the preset. "CUSTOM" honours the
  // user-supplied bounds; the presets are anchored to "today" so the page
  // always shows a rolling window when reopened.
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
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const result = await getDriverAttendanceHistory(driverId, range);
        if (cancelled) return;
        setDriver(result.driver);
        setDays(result.days);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Unable to load attendance history.",
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

  // Index days by date for O(1) lookup when we walk every date in the
  // range to build the chart and stats.
  const dayByDate = useMemo(() => {
    const map = new Map<string, ApiAttendanceDay>();
    for (const d of days) map.set(d.date, d);
    return map;
  }, [days]);

  const allDates = useMemo(
    () => enumerateDates(range.from, range.to),
    [range.from, range.to],
  );

  // Today's key — used to skip "missed check-out" / "absent" flags for
  // dates that haven't happened yet (otherwise opening a custom range
  // that ends in the future would inflate the absent count).
  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const stats: DerivedStats = useMemo(() => {
    const lateThresholdMinutes = timeStringToMinutes(lateAfter);
    const acc: DerivedStats = {
      scheduledDays: 0,
      workedDays: 0,
      absentDays: 0,
      onLeaveDays: 0,
      lateDays: 0,
      missedCheckInDays: 0,
      missedCheckOutDays: 0,
      autoClosedDays: 0,
      totalWorkedHours: 0,
      averageWorkedHours: 0,
    };

    for (const dateKey of allDates) {
      const day = dayByDate.get(dateKey);
      if (!day) continue; // no roster row -> skip; we don't fabricate stats.

      if (day.status === "ON_LEAVE") {
        acc.onLeaveDays += 1;
        continue;
      }
      acc.scheduledDays += 1;

      const punches = liveSortedPunches(day);
      const dayIn = firstPunchOfType(punches, "DAY_IN");
      const dayOut = lastPunchOfType(punches, "DAY_OUT");
      const isPast = dateKey < todayKey;

      if (!dayIn) {
        // Past dates with no DAY_IN are absent. Today/future stay neutral.
        if (isPast) acc.absentDays += 1;
        if (isPast) acc.missedCheckInDays += 1;
        continue;
      }

      acc.workedDays += 1;

      if (
        lateThresholdMinutes !== null &&
        punchMinutesOfDay(dayIn.at) > lateThresholdMinutes
      ) {
        acc.lateDays += 1;
      }

      if (!dayOut && isPast) {
        // A past day with DAY_IN but no DAY_OUT counts as missed-out even
        // if the system already auto-closed it (the synthetic DAY_OUT
        // doesn't undo the fact that the driver forgot).
        acc.missedCheckOutDays += 1;
      }

      if (day.autoClosedAt) acc.autoClosedDays += 1;

      acc.totalWorkedHours += computeWorkedHours(day);
    }

    acc.averageWorkedHours =
      acc.workedDays > 0 ? acc.totalWorkedHours / acc.workedDays : 0;
    return acc;
  }, [allDates, dayByDate, lateAfter, todayKey]);

  // Chart datapoints: one entry per calendar date in the range. `hours`
  // is worked hours (0 for missing/absent so the line stays continuous);
  // the per-date `target` reflects the same per-day overrides the
  // management page understands. `hasRecord` and `isAbsent` drive the
  // dot colouring without affecting the line itself.
  const chartData = useMemo(
    () =>
      allDates.map((dateKey) => {
        const day = dayByDate.get(dateKey);
        const target = targetHoursForDate(targetHoursMap, dateKey);
        if (!day) {
          return {
            dateKey,
            hours: 0,
            target,
            status: null as AttendanceDayStatus | null,
            hasRecord: false,
            isAbsent: false,
          };
        }
        const hours = computeWorkedHours(day);
        const isAbsent = day.status === "ABSENT";
        return {
          dateKey,
          hours,
          target,
          status: day.status,
          hasRecord: true,
          isAbsent,
        };
      }),
    [allDates, dayByDate, targetHoursMap],
  );

  // Most-common target across the range, used to label the "Target" pill
  // in the toolbar so a single overridden day doesn't make the headline
  // value flicker around.
  const dominantTarget = useMemo(() => {
    const counts = new Map<number, number>();
    for (const p of chartData) {
      counts.set(p.target, (counts.get(p.target) ?? 0) + 1);
    }
    let best = DEFAULT_TARGET_HOURS;
    let max = 0;
    for (const [t, c] of counts) {
      if (c > max) {
        max = c;
        best = t;
      }
    }
    return best;
  }, [chartData]);

  return (
    <div className="space-y-5">
      <Link
        href="/dashboard/attendance"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        Back to attendance
      </Link>

      <DriverHeaderCard driver={driver} isLoading={isLoading && !driver} />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {rangePreset === "CUSTOM" && (
              <div className="flex items-center gap-2">
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
            <label className="flex items-center gap-2 font-semibold text-muted-foreground">
              <Clock className="size-3.5" />
              Late after
              <input
                type="time"
                value={lateAfter}
                onChange={(e) =>
                  setLateAfter(e.target.value || DEFAULT_LATE_AFTER)
                }
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-primary focus:border-primary/40 focus:outline-none"
              />
            </label>
            <span
              title="Target hours are managed from the Attendance roster. Edit a day's target there and it will be reflected here."
              className="inline-flex items-center gap-1.5 rounded-md bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary/80"
            >
              Target <span className="tabular-nums">{dominantTarget}h</span>
            </span>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="size-4 shrink-0" />
          {loadError}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={X}
          label="Absent days"
          value={stats.absentDays}
          tone="rose"
          help="Past days with no day-in punch and not on leave."
        />
        <StatCard
          icon={Clock}
          label="Late days"
          value={stats.lateDays}
          tone="primary"
          help={`First punch later than ${lateAfter}.`}
        />
        <StatCard
          icon={LogIn}
          label="Missed check-ins"
          value={stats.missedCheckInDays}
          tone="rose"
          help="Past days with no DAY_IN recorded."
        />
        <StatCard
          icon={LogOut}
          label="Missed check-outs"
          value={stats.missedCheckOutDays}
          tone="rose"
          help="Past days with DAY_IN but no DAY_OUT (auto-closed by the system)."
        />
        <StatCard
          icon={CheckCircle}
          label="Worked days"
          value={stats.workedDays}
          tone="emerald"
          help="Days with at least one DAY_IN punch."
        />
        <StatCard
          icon={Coffee}
          label="On leave"
          value={stats.onLeaveDays}
          tone="primary"
          help="Manually flagged ON_LEAVE."
        />
        <StatCard
          icon={Clock}
          label="Total hours"
          value={stats.totalWorkedHours.toFixed(1)}
          suffix="h"
          tone="primary"
          help="Sum of (DAY_OUT − DAY_IN − breaks) across the range."
        />
        <StatCard
          icon={Clock}
          label="Average hours"
          value={stats.averageWorkedHours.toFixed(1)}
          suffix="h / day"
          tone="primary"
          help="Total hours divided by worked days."
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-primary">
              Performance — daily working hours
            </h3>
            <p className="text-xs text-muted-foreground">
              Hours per day, with each day&apos;s target shown as a dashed
              reference line. Hover a point for the exact value.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <ChartLegendDot className="bg-primary" label="Worked hours" />
            <ChartLegendDot className="bg-emerald-500" label="Met target" />
            <ChartLegendDot className="bg-rose-500" label="Absent" />
            <ChartLegendDash label="Target" />
          </div>
        </div>
        <PerformanceChart data={chartData} isLoading={isLoading} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
        <h3 className="mb-3 text-sm font-semibold text-primary">
          Day-by-day breakdown
        </h3>
        {isLoading ? (
          <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-10">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        ) : days.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-6 text-center text-xs italic text-muted-foreground">
            No attendance records for this driver in the selected range.
            Open the roster for these dates from the attendance page to seed
            them.
          </p>
        ) : (
          <ul className="space-y-2">
            {[...days]
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((day) => (
                <DayRow
                  key={day.id}
                  day={day}
                  hours={computeWorkedHours(day)}
                  targetHours={targetHoursForDate(targetHoursMap, day.date)}
                  lateAfterMinutes={timeStringToMinutes(lateAfter)}
                />
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header card
// ---------------------------------------------------------------------------

function DriverHeaderCard({
  driver,
  isLoading,
}: {
  driver: ApiDriver | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }
  if (!driver) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-muted-foreground shadow-sm">
        Driver not found.
      </div>
    );
  }
  const fullName = `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim();
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-base font-bold text-primary">
            {driver.firstName?.[0] ?? "?"}
            {driver.lastName?.[0] ?? ""}
          </span>
          <div className="min-w-0">
            <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
              Driver
            </p>
            <h2 className="truncate text-xl font-semibold text-primary">
              {fullName || "Unnamed driver"}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{driver.employeeId}</span>
              {driver.homeSite && (
                <span>
                  <span className="text-slate-300">·</span> Home site{" "}
                  <span className="font-semibold text-primary">
                    {driver.homeSite}
                  </span>
                </span>
              )}
              {driver.phoneNumber && (
                <span>
                  <span className="text-slate-300">·</span> {driver.phoneNumber}
                </span>
              )}
              <span>
                <span className="text-slate-300">·</span>{" "}
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                    driver.status === "ACTIVE"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-700",
                  )}
                >
                  {driver.status.replace("_", " ")}
                </span>
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card. Three tones only — `primary` for neutral / informational
// values, `emerald` for positive outcomes, `rose` for negative ones.
// ---------------------------------------------------------------------------

const STAT_TONES: Record<
  "primary" | "emerald" | "rose",
  { icon: string; value: string; bg: string }
> = {
  primary: {
    icon: "text-primary",
    value: "text-primary",
    bg: "bg-primary/10",
  },
  emerald: {
    icon: "text-emerald-700",
    value: "text-emerald-800",
    bg: "bg-emerald-50",
  },
  rose: {
    icon: "text-rose-700",
    value: "text-rose-800",
    bg: "bg-rose-50",
  },
};

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  tone,
  help,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  suffix?: string;
  tone: keyof typeof STAT_TONES;
  help?: string;
}) {
  const palette = STAT_TONES[tone];
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      title={help}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg",
            palette.bg,
            palette.icon,
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", palette.value)}>
        {value}
        {suffix && (
          <span className="ml-1 text-xs font-semibold text-muted-foreground">
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart legend dots
// ---------------------------------------------------------------------------

function ChartLegendDot({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block size-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}

function ChartLegendDash({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={14} height={4} aria-hidden="true">
        <line
          x1={0}
          y1={2}
          x2={14}
          y2={2}
          stroke="#64748b"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      </svg>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Performance chart (line graph)
// ---------------------------------------------------------------------------

interface ChartPoint {
  dateKey: string;
  hours: number;
  target: number;
  status: AttendanceDayStatus | null;
  hasRecord: boolean;
  isAbsent: boolean;
}

// Hand-rolled SVG line chart so the page doesn't need a charting dep.
// The line is drawn as a single polyline across every day; per-day dots
// are coloured by outcome (emerald when target was met, rose for an
// absent day, primary blue otherwise). The dashed target line is
// stepped so a per-day override surfaces as a small ledge — matching
// the per-date target overrides editable from the management page.
function PerformanceChart({
  data,
  isLoading,
}: {
  data: ChartPoint[];
  isLoading: boolean;
}) {
  if (isLoading && data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-10 text-center text-xs italic text-muted-foreground">
        No data to plot.
      </div>
    );
  }

  // Layout constants (in SVG user units). The viewBox preserves aspect
  // ratio but we expand the host width below when the day count gets
  // large so each datapoint keeps a comfortable minimum spacing.
  const CHART_HEIGHT = 220;
  const PADDING_TOP = 16;
  const PADDING_BOTTOM = 40;
  const PADDING_LEFT = 36;
  const PADDING_RIGHT = 12;
  const PLOT_HEIGHT = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const maxTarget = Math.max(...data.map((d) => d.target), 0);
  const maxObserved = Math.max(...data.map((d) => d.hours), 0);
  const maxHours = Math.max(maxTarget, Math.ceil(maxObserved + 1));

  // Min spacing between datapoints. For short ranges we expand so the
  // chart breathes; for long ranges we keep ~10px so 90 days still fit
  // (with horizontal scroll if the container is narrower).
  const MIN_STEP = 10;
  const STEP = Math.max(MIN_STEP, 24 - data.length * 0.1);
  const PLOT_WIDTH = Math.max(STEP, (data.length - 1) * STEP);
  const CHART_WIDTH = PADDING_LEFT + PLOT_WIDTH + PADDING_RIGHT;

  // Integer-hour gridlines. Wider stride at larger maxes keeps them
  // legible even at 14h+.
  const yTicks: number[] = [];
  const stride = maxHours <= 8 ? 2 : maxHours <= 14 ? 2 : 4;
  for (let v = 0; v <= maxHours; v += stride) yTicks.push(v);

  function xFor(idx: number) {
    return PADDING_LEFT + idx * STEP;
  }
  function yFor(value: number) {
    return PADDING_TOP + PLOT_HEIGHT * (1 - value / maxHours);
  }
  function dotFor(point: ChartPoint): { color: string; radius: number } {
    if (!point.hasRecord) return { color: "#cbd5e1", radius: 2.25 }; // slate-300
    if (point.isAbsent) return { color: "#f43f5e", radius: 3.5 }; // rose-500
    if (point.hours <= 0) return { color: "#94a3b8", radius: 2.5 }; // slate-400
    if (point.hours >= point.target)
      return { color: "#10b981", radius: 3.5 }; // emerald-500
    return { color: "#2563eb", radius: 3 }; // blue-600 (primary tone)
  }

  // Line path for worked hours. Single polyline so the line is
  // continuous; gaps are not used because we want the eye to follow
  // the trend even across missing/absent days (which still render at
  // 0 with a coloured marker).
  const linePath = data
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(p.hours)}`)
    .join(" ");

  // Stepped target path. Each datapoint contributes a horizontal
  // segment from its midpoint backwards/forwards by STEP/2 — when two
  // adjacent days share a target the segments visually merge into one
  // long dashed line; when they differ a small step appears. Falls
  // back to a single horizontal line when only one point exists.
  const targetPath =
    data.length === 1
      ? `M ${xFor(0)} ${yFor(data[0].target)} L ${xFor(0)} ${yFor(data[0].target)}`
      : data
          .map((p, i) => {
            const x = xFor(i);
            const y = yFor(p.target);
            return `${i === 0 ? "M" : "L"} ${x} ${y}`;
          })
          .join(" ");

  // X-axis labels: thin out so they don't overlap. The hover tooltip
  // on each dot still carries the full date for every day.
  const xLabelStride = Math.max(1, Math.ceil(data.length / 10));

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        width={Math.max(CHART_WIDTH, 600)}
        height={CHART_HEIGHT}
        role="img"
        aria-label="Daily working hours line chart"
        className="block"
      >
        {/* Y axis gridlines + labels */}
        {yTicks.map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick}>
              <line
                x1={PADDING_LEFT}
                x2={CHART_WIDTH - PADDING_RIGHT}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              <text
                x={PADDING_LEFT - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={10}
                fill="#64748b"
              >
                {tick}h
              </text>
            </g>
          );
        })}

        {/* Target line (dashed, follows per-day targets) */}
        <path
          d={targetPath}
          fill="none"
          stroke="#64748b"
          strokeWidth={1.25}
          strokeDasharray="4 4"
        />

        {/* Hours line */}
        <path
          d={linePath}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Datapoint dots */}
        {data.map((point, idx) => {
          const dot = dotFor(point);
          return (
            <circle
              key={point.dateKey}
              cx={xFor(idx)}
              cy={yFor(point.hours)}
              r={dot.radius}
              fill={dot.color}
              stroke="#ffffff"
              strokeWidth={1.25}
            >
              <title>
                {fullDateLabel(point.dateKey)} —{" "}
                {!point.hasRecord
                  ? "no record"
                  : point.isAbsent
                    ? "absent"
                    : `${point.hours.toFixed(2)} h of ${point.target}h target`}
              </title>
            </circle>
          );
        })}

        {/* X axis labels (thinned) */}
        {data.map((point, idx) => {
          if (idx % xLabelStride !== 0) return null;
          return (
            <text
              key={point.dateKey}
              x={xFor(idx)}
              y={CHART_HEIGHT - PADDING_BOTTOM + 16}
              textAnchor="middle"
              fontSize={10}
              fill="#64748b"
            >
              {shortDateLabel(point.dateKey)}
            </text>
          );
        })}

        {/* Axis lines */}
        <line
          x1={PADDING_LEFT}
          x2={CHART_WIDTH - PADDING_RIGHT}
          y1={CHART_HEIGHT - PADDING_BOTTOM}
          y2={CHART_HEIGHT - PADDING_BOTTOM}
          stroke="#cbd5e1"
        />
        <line
          x1={PADDING_LEFT}
          x2={PADDING_LEFT}
          y1={PADDING_TOP}
          y2={CHART_HEIGHT - PADDING_BOTTOM}
          stroke="#cbd5e1"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day-by-day breakdown row
// ---------------------------------------------------------------------------

function DayRow({
  day,
  hours,
  targetHours,
  lateAfterMinutes,
}: {
  day: ApiAttendanceDay;
  hours: number;
  targetHours: number;
  lateAfterMinutes: number | null;
}) {
  const punches = liveSortedPunches(day);
  const dayIn = firstPunchOfType(punches, "DAY_IN");
  const dayOut = lastPunchOfType(punches, "DAY_OUT");
  const isLate =
    lateAfterMinutes !== null &&
    dayIn !== null &&
    punchMinutesOfDay(dayIn.at) > lateAfterMinutes;
  const distanceKm =
    day.workDistanceKm !== null && day.workDistanceKm !== undefined
      ? Number.parseFloat(String(day.workDistanceKm))
      : NaN;
  const hasDistance = Number.isFinite(distanceKm) && distanceKm > 0;
  const metTarget = hours >= targetHours;

  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg bg-white text-primary ring-1 ring-slate-100">
            <span className="text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
              {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, {
                month: "short",
              })}
            </span>
            <span className="-mt-0.5 text-sm font-bold leading-none tabular-nums">
              {new Date(`${day.date}T00:00:00`).getDate()}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-primary">
                {fullDateLabel(day.date)}
              </p>
              <span
                className={cn(
                  "inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                  STATUS_STYLES[day.status],
                )}
              >
                {day.status.replace("_", " ")}
              </span>
              {isLate && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-rose-700 uppercase">
                  <Clock className="size-2.5" />
                  Late
                </span>
              )}
              {day.autoClosedAt &&
                (day.autoCloseReason ?? "")
                  .split(",")
                  .map((c) => c.trim())
                  .filter(Boolean)
                  .map((code) => (
                    <span
                      key={code}
                      title={`Auto-closed at ${new Date(day.autoClosedAt as string).toLocaleString()}`}
                      className="inline-flex w-fit items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-blue-700 uppercase"
                    >
                      <AlertTriangle className="size-2.5" />
                      {AUTO_CLOSE_REASON_LABELS[code] ?? "Auto-closed"}
                    </span>
                  ))}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {day.site?.name ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
              metTarget
                ? "bg-emerald-50 text-emerald-700"
                : "bg-primary/5 text-primary",
            )}
          >
            <Clock className="size-3" />
            {hours.toFixed(2)} h
            <span className="text-muted-foreground"> / {targetHours}h</span>
          </span>
          {hasDistance && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/5 px-2.5 py-1 text-[11px] font-bold text-primary">
              {distanceKm.toFixed(1)} km
            </span>
          )}
        </div>
      </div>
      {punches.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {punches.map((p) => (
            <PunchChip key={p.id} punch={p} />
          ))}
        </div>
      )}
      {!dayIn && day.status === "ABSENT" && (
        <p className="mt-2 text-[11px] italic text-rose-600">
          No DAY_IN punch recorded for this date.
        </p>
      )}
      {dayIn && !dayOut && (
        <p className="mt-2 text-[11px] italic text-primary/80">
          DAY_IN at {formatPunchTime(dayIn.at)} but no DAY_OUT recorded.
        </p>
      )}
    </li>
  );
}

function PunchChip({ punch }: { punch: ApiAttendancePunch }) {
  const isIn =
    punch.type === "DAY_IN" ||
    punch.type === "LUNCH_IN" ||
    punch.type === "MAINT_IN";
  const Icon =
    punch.type === "LUNCH_OUT" || punch.type === "LUNCH_IN"
      ? Coffee
      : punch.type === "MAINT_OUT" || punch.type === "MAINT_IN"
        ? Wrench
        : isIn
          ? LogIn
          : LogOut;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold tracking-wide uppercase",
        // Colour communicates direction (in vs out) using the page's
        // green/red accents; everything else stays neutral.
        isIn ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
      )}
      title={punch.note ?? undefined}
    >
      <Icon className="size-3" />
      {PUNCH_LABELS[punch.type]}
      <span className="font-mono text-muted-foreground">
        {formatPunchTime(punch.at)}
      </span>
    </span>
  );
}
