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
//   2. Date-range picker + schedule from attendance rules
//   3. Stat cards (absent / late / missed check-in / missed check-out + worked hours)
//   4. Performance line chart (days × worked hours)
//   5. Day-by-day breakdown list
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  ChevronDown,
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
import { getAttendanceRules } from "@/lib/api/attendanceRules";
import {
  formatDate,
  formatDateTime,
  formatScheduleTime,
  formatTimeOfDay,
} from "@/lib/time/format";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import type {
  ApiAttendanceDay,
  ApiAttendancePunch,
  ApiAttendanceRules,
  ApiDriver,
  ApiTimeSettings,
  AttendanceDayStatus,
  AttendancePunchType,
} from "@/lib/api/types";
import {
  DEFAULT_ATTENDANCE_SCHEDULE,
  evaluateDayScheduleCompliance,
  formatScheduleSummary,
  getPunchScheduleTiming,
  type DayScheduleFlags,
} from "@/lib/attendance/scheduleCompliance";
import { AUTO_CLOSE_REASON_LABELS } from "@/lib/attendance/attendanceHelpers";
import { staggerStyle } from "@/lib/animations";
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

const RANGE_PRESETS: { id: "7" | "30" | "90"; label: string; days: number }[] = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
];

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

function shortDateLabel(
  dateKey: string,
  settings: ApiTimeSettings,
): string {
  return formatDate(`${dateKey}T00:00:00`, settings, {
    month: "short",
    day: "numeric",
  });
}

function fullDateLabel(
  dateKey: string,
  settings: ApiTimeSettings,
): string {
  return formatDate(`${dateKey}T00:00:00`, settings, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPunchTime(iso: string, settings: ApiTimeSettings): string {
  return formatTimeOfDay(iso, settings);
}

function formatRelativeTime(iso: string, settings: ApiTimeSettings): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return "Just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return shortDateLabel(toDateKey(new Date(iso)), settings);
}

interface AttendanceActivity {
  id: string;
  punchType: AttendancePunchType;
  at: string;
  dateKey: string;
  siteName?: string | null;
  note?: string | null;
}

function collectRecentActivities(
  days: ApiAttendanceDay[],
  limit = 8,
): AttendanceActivity[] {
  const activities: AttendanceActivity[] = [];
  for (const day of days) {
    for (const punch of day.punches ?? []) {
      if (punch.isVoided) continue;
      activities.push({
        id: punch.id,
        punchType: punch.type,
        at: punch.at,
        dateKey: day.date,
        siteName: day.site?.name,
        note: punch.note,
      });
    }
  }
  return activities
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
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
  const { settings } = useTimeSettings();
  const [rangePreset, setRangePreset] = useState<"7" | "30" | "90" | "CUSTOM">(
    "30",
  );
  const [customFrom, setCustomFrom] = useState<string>(() =>
    toDateKey(addDays(new Date(), -29)),
  );
  const [customTo, setCustomTo] = useState<string>(() => toDateKey(new Date()));
  const [rules, setRules] = useState<ApiAttendanceRules | null>(null);
  const schedule = rules ?? DEFAULT_ATTENDANCE_SCHEDULE;
  const targetHours = schedule.targetHours;
  const scheduleSummary = formatScheduleSummary(schedule, settings);

  const [driver, setDriver] = useState<ApiDriver | null>(null);
  const [days, setDays] = useState<ApiAttendanceDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const [syncedColumnHeight, setSyncedColumnHeight] = useState<number | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void getAttendanceRules()
      .then((loaded) => {
        if (!cancelled) setRules(loaded);
      })
      .catch(() => {
        // Soft-fail: DEFAULT_ATTENDANCE_SCHEDULE is used until rules load.
      });
    return () => {
      cancelled = true;
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
      const flags = evaluateDayScheduleCompliance(day, schedule, todayKey);

      if (!dayIn) {
        // Past dates with no DAY_IN are absent. Today/future stay neutral.
        if (flags.missedCheckIn) acc.absentDays += 1;
        if (flags.missedCheckIn) acc.missedCheckInDays += 1;
        continue;
      }

      acc.workedDays += 1;

      if (flags.lateCheckIn) acc.lateDays += 1;
      if (flags.missedCheckOut) acc.missedCheckOutDays += 1;

      if (day.autoClosedAt) acc.autoClosedDays += 1;

      acc.totalWorkedHours += computeWorkedHours(day);
    }

    acc.averageWorkedHours =
      acc.workedDays > 0 ? acc.totalWorkedHours / acc.workedDays : 0;
    return acc;
  }, [allDates, dayByDate, schedule, todayKey]);

  // Chart datapoints: one entry per calendar date in the range. `hours`
  // is worked hours (0 for missing/absent so the line stays continuous);
  // the per-date `target` reflects the same per-day overrides the
  // management page understands. `hasRecord` and `isAbsent` drive the
  // dot colouring without affecting the line itself.
  const chartData = useMemo(
    () =>
      allDates.map((dateKey) => {
        const day = dayByDate.get(dateKey);
        const target = targetHours;
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
    [allDates, dayByDate, targetHours],
  );

  // Compact 7-day window centred on today (3 days before, today, 3 days
  // after) so the in-card chart fits without horizontal scroll while
  // still giving context around the current day. Falls back to the
  // closest 7 datapoints when today is at the edge / outside the range.
  const compactChartData = useMemo(() => {
    if (chartData.length <= 7) return chartData;
    let centreIdx = chartData.findIndex((p) => p.dateKey === todayKey);
    if (centreIdx === -1) {
      const todayMs = new Date(`${todayKey}T00:00:00`).getTime();
      let bestIdx = 0;
      let bestDelta = Number.POSITIVE_INFINITY;
      for (let i = 0; i < chartData.length; i += 1) {
        const delta = Math.abs(
          new Date(`${chartData[i].dateKey}T00:00:00`).getTime() - todayMs,
        );
        if (delta < bestDelta) {
          bestDelta = delta;
          bestIdx = i;
        }
      }
      centreIdx = bestIdx;
    }
    let start = centreIdx - 3;
    let end = centreIdx + 4;
    if (start < 0) {
      end += -start;
      start = 0;
    }
    if (end > chartData.length) {
      start = Math.max(0, start - (end - chartData.length));
      end = chartData.length;
    }
    return chartData.slice(start, end);
  }, [chartData, todayKey]);

  // On desktop, pin the driver header card height to the filters + chart
  // column so both sides align; overflow scrolls inside the activity list
  // with a hidden scrollbar.
  useEffect(() => {
    const el = rightColumnRef.current;
    if (!el) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const syncHeight = () => {
      if (!mq.matches) {
        setSyncedColumnHeight(null);
        return;
      }
      setSyncedColumnHeight(el.offsetHeight);
    };
    const observer = new ResizeObserver(syncHeight);
    observer.observe(el);
    mq.addEventListener("change", syncHeight);
    syncHeight();
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", syncHeight);
    };
  }, [isLoading, rangePreset]);

  return (
    <div className="space-y-5 fs-panel-in">
      <Link
        href="/dashboard/attendance"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        Back to attendance
      </Link>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
        <DriverHeaderCard
          driver={driver}
          days={days}
          isLoading={isLoading && !driver}
          activitiesLoading={isLoading}
          syncedHeight={syncedColumnHeight}
        />

        <div
          ref={rightColumnRef}
          className="flex min-w-0 flex-1 flex-col gap-5"
        >
        <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
          <div className="flex flex-col gap-3">
            <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
              Date range &amp; filters
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
              <div className="flex flex-wrap items-center gap-2 text-xs">
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

            <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Clock className="mt-0.5 size-3.5 shrink-0 text-primary/70" />
              <span>
                <span className="font-semibold text-primary">Schedule</span>
                {" — "}
                {scheduleSummary}
                {!rules && (
                  <span className="text-slate-400"> (default until rules load)</span>
                )}
              </span>
            </p>

            <div className="mt-1 border-t border-slate-100 pt-3">
              <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
                Summary stats
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-4">
                <StatCard
                  embedded
                  icon={X}
                  label="Absent days"
                  value={stats.absentDays}
                  tone="rose"
                  help="Past days with no day-in punch and not on leave."
                />
                <StatCard
                  embedded
                  icon={Clock}
                  label="Late days"
                  value={stats.lateDays}
                  tone="primary"
                  help={`Day in after ${formatScheduleTime(schedule.dayInTime, settings)}.`}
                />
                <StatCard
                  embedded
                  icon={LogIn}
                  label="Missed check-ins"
                  value={stats.missedCheckInDays}
                  tone="rose"
                  help="Past days with no DAY_IN recorded."
                />
                <StatCard
                  embedded
                  icon={LogOut}
                  label="Missed check-outs"
                  value={stats.missedCheckOutDays}
                  tone="rose"
                  help={`Past days with day in but no day out by ${formatScheduleTime(schedule.dayOutTime, settings)} (including auto-closed).`}
                />
                <StatCard
                  embedded
                  icon={CheckCircle}
                  label="Worked days"
                  value={stats.workedDays}
                  tone="emerald"
                  help="Days with at least one DAY_IN punch."
                />
                <StatCard
                  embedded
                  icon={Coffee}
                  label="On leave"
                  value={stats.onLeaveDays}
                  tone="primary"
                  help="Manually flagged ON_LEAVE."
                />
                <StatCard
                  embedded
                  icon={Clock}
                  label="Total hours"
                  value={stats.totalWorkedHours.toFixed(1)}
                  suffix="h"
                  tone="primary"
                  help="Sum of (DAY_OUT − DAY_IN − breaks) across the range."
                />
                <StatCard
                  embedded
                  icon={Clock}
                  label="Average hours"
                  value={stats.averageWorkedHours.toFixed(1)}
                  suffix="h / day"
                  tone="primary"
                  help="Total hours divided by worked days."
                />
              </div>
            </div>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
              <h3 className="text-sm font-semibold text-primary">
                Performance
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <ChartLegendDot className="bg-primary" label="Worked hours" />
              <ChartLegendDot className="bg-emerald-500" label="Met target" />
              <ChartLegendDot className="bg-rose-500" label="Absent" />
              <ChartLegendDash label="Target" />
            </div>
          </div>
          <PerformanceChart data={compactChartData} isLoading={isLoading} />
        </section>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="size-4 shrink-0" />
          {loadError}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
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
          <ul className="space-y-2 fs-content-fade">
            {[...days]
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .map((day, index) => (
                <DayRow
                  key={day.id}
                  day={day}
                  hours={computeWorkedHours(day)}
                  targetHours={targetHours}
                  schedule={schedule}
                  todayKey={todayKey}
                  className="fs-row-in"
                  style={staggerStyle(index)}
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

const PUNCH_ACTIVITY_ICONS: Record<
  AttendancePunchType,
  { icon: React.ComponentType<{ className?: string }>; wrap: string }
> = {
  DAY_IN: { icon: LogIn, wrap: "bg-emerald-50 text-emerald-700" },
  DAY_OUT: { icon: LogOut, wrap: "bg-rose-50 text-rose-700" },
  LUNCH_OUT: { icon: Coffee, wrap: "bg-primary/10 text-primary" },
  LUNCH_IN: { icon: Coffee, wrap: "bg-primary/10 text-primary" },
  MAINT_OUT: { icon: Wrench, wrap: "bg-primary/10 text-primary" },
  MAINT_IN: { icon: Wrench, wrap: "bg-primary/10 text-primary" },
};

function DriverHeaderCard({
  driver,
  days,
  isLoading,
  activitiesLoading,
  syncedHeight,
}: {
  driver: ApiDriver | null;
  days: ApiAttendanceDay[];
  isLoading: boolean;
  activitiesLoading: boolean;
  syncedHeight: number | null;
}) {
  const heightStyle =
    syncedHeight != null ? { height: syncedHeight } : undefined;
  const cardClassName = cn(
    "flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white lg:w-[37.5%]",
    // Only enforce a minimum height on desktop when not syncing to the
    // right column. Mobile sizes naturally to its content.
    syncedHeight == null && "lg:min-h-[320px]",
  );
  const recentActivities = useMemo(
    () => collectRecentActivities(days),
    [days],
  );

  if (isLoading) {
    return (
      <div
        className={cn(cardClassName, "items-center justify-center p-6")}
        style={heightStyle}
      >
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }
  if (!driver) {
    return (
      <div
        className={cn(cardClassName, "p-5 text-sm text-muted-foreground")}
        style={heightStyle}
      >
        Driver not found.
      </div>
    );
  }
  const fullName = `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim();
  return (
    <div className={cardClassName} style={heightStyle}>
        <div className="shrink-0 border-b border-slate-100 p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
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
                    <span className="text-slate-300">·</span>{" "}
                    {driver.phoneNumber}
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

        <div className="flex min-h-0 flex-1 flex-col p-5">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <h3 className="text-xs font-semibold text-primary">
              Recent attendance activity
            </h3>
            {recentActivities.length > 0 && (
              <span className="text-[10px] font-semibold text-muted-foreground">
                {recentActivities.length} events
              </span>
            )}
          </div>

          {activitiesLoading ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 py-8">
              <Loader2 className="size-4 animate-spin text-primary" />
            </div>
          ) : recentActivities.length === 0 ? (
            <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-8 text-center text-xs italic text-muted-foreground">
              No punch activity in the selected date range.
            </p>
          ) : (
            <>
              {/* Mobile: compact badges; flex-wrap fills two rows
                  naturally and overflow scrolls horizontally without a
                  visible scrollbar. */}
              <div className="scrollbar-hide -mx-1 flex max-h-[68px] flex-wrap content-start items-start gap-1.5 overflow-x-auto px-1 pb-0.5 lg:hidden">
                {recentActivities.map((activity) => (
                  <ActivityBadge key={activity.id} activity={activity} />
                ))}
              </div>

              {/* Desktop: full activity rows */}
              <ul className="scrollbar-hide hidden min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5 lg:block">
                {recentActivities.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} />
                ))}
              </ul>
            </>
          )}
        </div>
    </div>
  );
}

function ActivityBadge({ activity }: { activity: AttendanceActivity }) {
  const { icon: Icon, wrap } = PUNCH_ACTIVITY_ICONS[activity.punchType];
  const { settings } = useTimeSettings();
  return (
    <span
      title={`${PUNCH_LABELS[activity.punchType]} · ${formatPunchTime(activity.at, settings)}${activity.siteName ? ` · ${activity.siteName}` : ""}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold tracking-wide uppercase",
        wrap,
      )}
    >
      <Icon className="size-3" />
      {PUNCH_LABELS[activity.punchType]}
      <span className="font-mono opacity-70">
        {formatRelativeTime(activity.at, settings)}
      </span>
    </span>
  );
}

function ActivityRow({ activity }: { activity: AttendanceActivity }) {
  const { icon: Icon, wrap } = PUNCH_ACTIVITY_ICONS[activity.punchType];
  const { settings } = useTimeSettings();
  const detailParts = [
    formatPunchTime(activity.at, settings),
    activity.siteName ?? null,
    activity.note ?? null,
  ].filter(Boolean);

  return (
    <li className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          wrap,
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-xs font-semibold text-primary">
            {PUNCH_LABELS[activity.punchType]}
          </p>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {formatRelativeTime(activity.at, settings)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {shortDateLabel(activity.dateKey, settings)}
          {detailParts.length > 0 && (
            <>
              <span className="text-slate-300"> · </span>
              {detailParts.join(" · ")}
            </>
          )}
        </p>
      </div>
    </li>
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
  embedded = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  suffix?: string;
  tone: keyof typeof STAT_TONES;
  help?: string;
  embedded?: boolean;
}) {
  const palette = STAT_TONES[tone];
  if (embedded) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 px-2.5 py-2"
        title={help}
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg",
            palette.bg,
            palette.icon,
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] font-bold leading-tight tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p
            className={cn(
              "mt-0.5 text-base font-bold leading-none tabular-nums",
              palette.value,
            )}
          >
            {value}
            {suffix && (
              <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                {suffix}
              </span>
            )}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-4"
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
  const { settings } = useTimeSettings();
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

  // Layout constants (in SVG user units). The viewBox scales to 100%
  // of the parent width via preserveAspectRatio so the chart always
  // fills its container.
  const CHART_HEIGHT = 220;
  const PADDING_TOP = 16;
  const PADDING_BOTTOM = 40;
  const PADDING_LEFT = 36;
  const PADDING_RIGHT = 12;
  const PLOT_HEIGHT = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const maxTarget = Math.max(...data.map((d) => d.target), 0);
  const maxObserved = Math.max(...data.map((d) => d.hours), 0);
  const maxHours = Math.max(maxTarget, Math.ceil(maxObserved + 1));

  // Step between datapoints is sized so the natural plot width tracks a
  // reference of ~540 user units. The SVG then renders at width="100%"
  // and scales fluidly with its container while keeping a sensible
  // aspect ratio. We clamp to MIN_STEP so 90-day ranges still readable
  // (the SVG just scales them more compactly), and to MAX_STEP so a
  // single datapoint doesn't blow the chart out horizontally.
  const REFERENCE_PLOT_WIDTH = 540;
  const MIN_STEP = 10;
  const MAX_STEP = 120;
  const STEP =
    data.length > 1
      ? Math.min(
          MAX_STEP,
          Math.max(MIN_STEP, REFERENCE_PLOT_WIDTH / (data.length - 1)),
        )
      : REFERENCE_PLOT_WIDTH;
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
    <div className="w-full">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Daily working hours line chart"
        className="block h-auto w-full"
      >
        {/* Vertical day gridlines (dashed) — one per datapoint so each
            day is visually anchored on the x-axis. */}
        {data.map((point, idx) => (
          <line
            key={`vgrid-${point.dateKey}`}
            x1={xFor(idx)}
            x2={xFor(idx)}
            y1={PADDING_TOP}
            y2={CHART_HEIGHT - PADDING_BOTTOM}
            stroke="#e2e8f0"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ))}

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
                {fullDateLabel(point.dateKey, settings)} —{" "}
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
              {shortDateLabel(point.dateKey, settings)}
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
  schedule,
  todayKey,
  className,
  style,
}: {
  day: ApiAttendanceDay;
  hours: number;
  targetHours: number;
  schedule: ApiAttendanceRules;
  todayKey: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { settings } = useTimeSettings();
  const [expanded, setExpanded] = useState(false);
  const punches = liveSortedPunches(day);
  const flags = evaluateDayScheduleCompliance(day, schedule, todayKey);
  const distanceKm =
    day.workDistanceKm !== null && day.workDistanceKm !== undefined
      ? Number.parseFloat(String(day.workDistanceKm))
      : NaN;
  const hasDistance = Number.isFinite(distanceKm) && distanceKm > 0;
  const metTarget = hours >= targetHours;
  const panelId = `day-detail-${day.id}`;

  return (
    <li
      style={style}
      className={cn(
        "overflow-hidden rounded-xl border bg-slate-50/50 transition-colors",
        expanded
          ? "border-primary/20 ring-1 ring-primary/10"
          : "border-slate-100",
        className,
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
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-primary">
                {fullDateLabel(day.date, settings)}
              </p>
              <span
                className={cn(
                  "inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                  STATUS_STYLES[day.status],
                )}
              >
                {day.status.replace("_", " ")}
              </span>
              <DayScheduleBadges flags={flags} />
              {!expanded &&
                day.autoClosedAt &&
                (day.autoCloseReason ?? "")
                  .split(",")
                  .map((c) => c.trim())
                  .filter(Boolean)
                  .slice(0, 1)
                  .map((code) => (
                    <span
                      key={code}
                      className="inline-flex w-fit items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-blue-700 uppercase"
                    >
                      <AlertTriangle className="size-2.5" />
                      {AUTO_CLOSE_REASON_LABELS[code] ?? "Auto-closed"}
                    </span>
                  ))}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {day.site?.name ?? "—"}
              {punches.length > 0 && !expanded && (
                <span className="text-slate-300"> · </span>
              )}
              {punches.length > 0 && !expanded && (
                <span className="font-semibold text-primary/70">
                  {punches.length} punch{punches.length === 1 ? "" : "es"}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:pl-2">
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
          {day.autoClosedAt &&
            (day.autoCloseReason ?? "")
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean)
              .map((code) => (
                <p
                  key={code}
                  className="mb-3 flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700"
                >
                  <AlertTriangle className="size-3 shrink-0" />
                  {AUTO_CLOSE_REASON_LABELS[code] ?? "Auto-closed"} —{" "}
                  {formatDateTime(day.autoClosedAt as string, settings)}
                </p>
              ))}

          {day.notes && (
            <p className="mb-3 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-[11px] text-muted-foreground">
              <span className="font-semibold text-primary">Notes:</span>{" "}
              {day.notes}
            </p>
          )}

          {punches.length > 0 ? (
            <div>
              <p className="mb-2 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                Punch timeline
              </p>
              <div className="flex w-full flex-nowrap items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                {punches.map((p) => (
                  <PunchChip
                    key={p.id}
                    punch={p}
                    schedule={schedule}
                    variant="blue"
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] italic text-muted-foreground">
              No punches recorded for this day.
            </p>
          )}

        </div>
      )}
    </li>
  );
}

const SCHEDULE_BADGES: {
  key: keyof DayScheduleFlags;
  label: string;
  tone: "rose" | "orange" | "primary";
}[] = [
  { key: "lateCheckIn", label: "Late check-in", tone: "rose" },
  { key: "lateCheckOut", label: "Late check-out", tone: "rose" },
  { key: "earlyCheckOut", label: "Early check-out", tone: "orange" },
  { key: "lateLunchOut", label: "Late lunch out", tone: "rose" },
  { key: "earlyLunchReturn", label: "Early lunch return", tone: "orange" },
  { key: "lateLunchReturn", label: "Late lunch return", tone: "rose" },
  { key: "missedCheckIn", label: "Missed check-in", tone: "orange" },
  { key: "missedCheckOut", label: "Missed check-out", tone: "orange" },
  { key: "missedLunchOut", label: "Missed lunch out", tone: "orange" },
  { key: "missedLunchReturn", label: "Missed lunch return", tone: "orange" },
  { key: "openLunchBreak", label: "On lunch", tone: "primary" },
  { key: "openMaintBreak", label: "On maintenance", tone: "primary" },
];

function DayScheduleBadges({ flags }: { flags: DayScheduleFlags }) {
  return (
    <>
      {SCHEDULE_BADGES.filter(({ key }) => flags[key]).map(({ key, label, tone }) => (
        <ScheduleFlagBadge key={key} label={label} tone={tone} />
      ))}
    </>
  );
}

function ScheduleFlagBadge({
  label,
}: {
  label: string;
  tone?: "rose" | "orange" | "primary";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
        "bg-blue-50 text-blue-700",
      )}
    >
      <AlertTriangle className="size-2.5" />
      {label}
    </span>
  );
}

function PunchChip({
  punch,
  schedule,
  variant = "directional",
}: {
  punch: ApiAttendancePunch;
  schedule?: ApiAttendanceRules;
  variant?: "directional" | "blue";
}) {
  const { settings } = useTimeSettings();
  const timing =
    schedule != null ? getPunchScheduleTiming(punch, schedule) : null;
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
  const timingHint =
    timing?.isLate === true
      ? "Late vs schedule"
      : timing?.isEarly === true
        ? "Early vs schedule"
        : undefined;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold tracking-wide uppercase ring-1 ring-transparent",
        variant === "blue"
          ? timing?.isLate
            ? "bg-rose-50 text-rose-700 ring-rose-200"
            : timing?.isEarly
              ? "bg-orange-50 text-orange-700 ring-orange-200"
              : "bg-blue-50 text-blue-700"
          : isIn
            ? "bg-emerald-50 text-emerald-700"
            : "bg-rose-50 text-rose-700",
      )}
      title={[timingHint, punch.note].filter(Boolean).join(" · ") || undefined}
    >
      <Icon className="size-3" />
      {PUNCH_LABELS[punch.type]}
      <span
        className={cn(
          "font-mono",
          variant === "blue" ? "text-blue-600/80" : "text-muted-foreground",
        )}
      >
        {formatPunchTime(punch.at, settings)}
      </span>
      {timing?.isLate && (
        <span className="text-[9px] font-bold text-rose-600">late</span>
      )}
      {timing?.isEarly && !timing.isLate && (
        <span className="text-[9px] font-bold text-orange-600">early</span>
      )}
    </span>
  );
}
