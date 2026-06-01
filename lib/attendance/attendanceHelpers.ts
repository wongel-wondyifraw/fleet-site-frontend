// Pure (non-React) helpers and shared constants for the attendance
// management view. Extracted from AttendanceManagement.tsx so that
// component's source map stays small enough that Chrome DevTools
// doesn't run out of heap when the dashboard is open.

import { Clock, Coffee, Wrench } from "@/lib/icons";
import { formatTimeOfDay } from "@/lib/time/format";
import type {
  ApiAttendanceDay,
  ApiAttendancePunch,
  ApiTimeSettings,
  AttendanceDayStatus,
  AttendancePunchType,
} from "@/lib/api/types";
import type { ComponentType, SVGProps } from "react";

export type DateFilter = "TODAY" | "YESTERDAY" | "CUSTOM";
export type StatusFilter = AttendanceDayStatus | "ALL";

// Site-tab sentinel ids. The site tabs are computed from the loaded
// roster and prefixed with these constants so we never collide with a
// real site id. ALL_SITES_TAB shows everyone; UNASSIGNED_TAB shows
// drivers whose vehicle / direct assignment can't be resolved to a site.
export const ALL_SITES_TAB = "__ALL__";
export const UNASSIGNED_TAB = "__UNASSIGNED__";

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "EXPECTED", label: "Expected" },
  { value: "PRESENT", label: "Present" },
  { value: "ON_BREAK", label: "On Break" },
  { value: "DONE", label: "Done" },
  { value: "ABSENT", label: "Absent" },
  { value: "ON_LEAVE", label: "On Leave" },
];

export const STATUS_STYLES: Record<AttendanceDayStatus, string> = {
  EXPECTED: "bg-slate-100 text-slate-700",
  PRESENT: "bg-blue-50 text-blue-700",
  ON_BREAK: "bg-amber-50 text-amber-700",
  DONE: "bg-emerald-50 text-emerald-700",
  ABSENT: "bg-rose-50 text-rose-700",
  ON_LEAVE: "bg-orange-50 text-orange-700",
};

// Human label per autoCloseReason code the backend emits. Keep the keys
// in sync with the constants in AttendanceService (AUTO_CLOSE_*).
// Unknown codes fall back to a generic "Auto-closed" badge so a future
// backend addition doesn't render as a blank chip.
export const AUTO_CLOSE_REASON_LABELS: Record<string, string> = {
  MISSING_DAY_OUT: "No day out",
  MISSING_LUNCH_RETURN: "Afternoon absent",
  MISSING_MAINT_RETURN: "Maint not closed",
};

export type FeatherIcon = ComponentType<SVGProps<SVGSVGElement>>;

export const PUNCH_PAIRS: {
  key: "day" | "lunch" | "maint";
  label: string;
  outType: AttendancePunchType;
  inType: AttendancePunchType;
  Icon: FeatherIcon;
}[] = [
  { key: "day", label: "Day", outType: "DAY_IN", inType: "DAY_OUT", Icon: Clock },
  { key: "lunch", label: "Lunch", outType: "LUNCH_OUT", inType: "LUNCH_IN", Icon: Coffee },
  { key: "maint", label: "Maintenance", outType: "MAINT_OUT", inType: "MAINT_IN", Icon: Wrench },
];

// Punch types that require an odometer reading from the timekeeper.
// These are the four events that bracket the morning + afternoon "work
// legs" the fuel module uses to compute per-shift distance:
//   morning   = LUNCH_OUT.odometer − DAY_IN.odometer
//   afternoon = DAY_OUT.odometer − LUNCH_IN.odometer
// Maintenance punches deliberately stay odometer-free — they happen
// mid-leg and would double-count if folded into the calculation.
export const ODOMETER_REQUIRED_PUNCH_TYPES: ReadonlySet<AttendancePunchType> =
  new Set(["DAY_IN", "DAY_OUT", "LUNCH_OUT", "LUNCH_IN"]);

export function toLocalDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function prettyStatus(status: AttendanceDayStatus): string {
  return status.replace("_", " ");
}

export function driverName(day: ApiAttendanceDay): string {
  const driver = day.driver;
  if (!driver) return "Unknown driver";
  const composed = `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim();
  return composed || driver.employeeId || "Unnamed driver";
}

// Returns non-voided punches in chronological order.
export function toLivePunches(day: ApiAttendanceDay): ApiAttendancePunch[] {
  return [...(day.punches ?? [])]
    .filter((p) => !p.isVoided)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function latestPunchByType(
  punches: ApiAttendancePunch[],
  type: AttendancePunchType,
): ApiAttendancePunch | null {
  for (let i = punches.length - 1; i >= 0; i -= 1) {
    if (punches[i].type === type) return punches[i];
  }
  return null;
}

// Counts how many `outType` punches have not yet been matched by an
// `inType` (e.g. how many lunches are still in-progress). Useful for
// the row state machine.
export function countOpen(
  punches: ApiAttendancePunch[],
  outType: AttendancePunchType,
  inType: AttendancePunchType,
): number {
  let count = 0;
  for (const p of punches) {
    if (p.type === outType) count += 1;
    else if (p.type === inType) count -= 1;
  }
  return count;
}

export function isPairOpen(
  punches: ApiAttendancePunch[],
  outType: AttendancePunchType,
  inType: AttendancePunchType,
): boolean {
  return countOpen(punches, outType, inType) > 0;
}

// Approximate worked-hour count for the donut and aggregate rows.
// Subtracts every closed (and currently-open) lunch / maintenance
// pair from the gross day window so the figure tracks actual time on
// the clock. Falls back to 0 when the day hasn't started or has
// inverted timestamps (clock skew).
export function computeWorkedHours(
  day: ApiAttendanceDay,
  targetDateKey: string,
): number {
  const punches = toLivePunches(day);
  const dayIn = latestPunchByType(punches, "DAY_IN");
  if (!dayIn) return 0;
  const dayOut = latestPunchByType(punches, "DAY_OUT");
  const start = new Date(dayIn.at).getTime();
  const now = Date.now();
  const end =
    dayOut?.at != null
      ? new Date(dayOut.at).getTime()
      : day.date === targetDateKey
        ? now
        : start;
  if (end <= start) return 0;

  let breakMs = 0;
  for (const pair of PUNCH_PAIRS.slice(1)) {
    let openAt: number | null = null;
    for (const p of punches) {
      if (p.type === pair.outType) {
        openAt = new Date(p.at).getTime();
      } else if (p.type === pair.inType && openAt !== null) {
        const closeAt = new Date(p.at).getTime();
        breakMs += Math.max(0, closeAt - openAt);
        openAt = null;
      }
    }
    if (openAt !== null) breakMs += Math.max(0, end - openAt);
  }
  return Math.max(0, (end - start - breakMs) / (1000 * 60 * 60));
}

export function formatPunchTime(iso: string, settings: ApiTimeSettings): string {
  return formatTimeOfDay(iso, settings);
}

// Converts an ISO timestamp into the `<input type="datetime-local">`
// format (no zone, local-clock). Used by the punch-correction dialog so
// the user edits in their own timezone.
export function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function fromLocalDateTimeInput(local: string): string {
  return new Date(local).toISOString();
}
