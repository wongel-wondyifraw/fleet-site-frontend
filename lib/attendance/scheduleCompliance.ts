import { DEFAULT_TARGET_HOURS } from "@/lib/attendance-targets";
import { formatScheduleTime } from "@/lib/time/format";
import type {
  ApiAttendanceDay,
  ApiAttendancePunch,
  ApiAttendanceRules,
  ApiTimeSettings,
  AttendancePunchType,
} from "@/lib/api/types";

import {
  countOpen,
  toLivePunches,
  latestPunchByType,
} from "@/lib/attendance/attendanceHelpers";

/** Fallback when rules have not loaded yet — matches AttendanceRulesPanel defaults. */
export const DEFAULT_ATTENDANCE_SCHEDULE: ApiAttendanceRules = {
  dayInTime: "08:00",
  lunchOutTime: "12:00",
  lunchInTime: "13:00",
  dayOutTime: "17:00",
  targetHours: DEFAULT_TARGET_HOURS,
};

export interface ScheduleThresholds {
  dayIn: number;
  lunchOut: number;
  lunchIn: number;
  dayOut: number;
}

export interface DayScheduleFlags {
  lateCheckIn: boolean;
  earlyCheckIn: boolean;
  missedCheckIn: boolean;
  missedCheckOut: boolean;
  earlyCheckOut: boolean;
  lateCheckOut: boolean;
  missedLunchOut: boolean;
  missedLunchReturn: boolean;
  lateLunchOut: boolean;
  earlyLunchOut: boolean;
  lateLunchReturn: boolean;
  earlyLunchReturn: boolean;
  openLunchBreak: boolean;
  openMaintBreak: boolean;
}

export interface PunchScheduleTiming {
  punchType: AttendancePunchType;
  isEarly: boolean;
  isLate: boolean;
}

const EMPTY_FLAGS: DayScheduleFlags = {
  lateCheckIn: false,
  earlyCheckIn: false,
  missedCheckIn: false,
  missedCheckOut: false,
  earlyCheckOut: false,
  lateCheckOut: false,
  missedLunchOut: false,
  missedLunchReturn: false,
  lateLunchOut: false,
  earlyLunchOut: false,
  lateLunchReturn: false,
  earlyLunchReturn: false,
  openLunchBreak: false,
  openMaintBreak: false,
};

export function timeStringToMinutes(value: string): number | null {
  const [hh, mm] = value.split(":").map((s) => Number.parseInt(s, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

export function punchMinutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export function getScheduleThresholds(
  rules: ApiAttendanceRules,
): ScheduleThresholds {
  const dayIn = timeStringToMinutes(rules.dayInTime);
  const lunchOut = timeStringToMinutes(rules.lunchOutTime);
  const lunchIn = timeStringToMinutes(rules.lunchInTime);
  const dayOut = timeStringToMinutes(rules.dayOutTime);
  return {
    dayIn: dayIn ?? 8 * 60,
    lunchOut: lunchOut ?? 12 * 60,
    lunchIn: lunchIn ?? 13 * 60,
    dayOut: dayOut ?? 17 * 60,
  };
}

export function formatScheduleSummary(
  rules: ApiAttendanceRules,
  settings: ApiTimeSettings,
): string {
  const dayIn = formatScheduleTime(rules.dayInTime, settings);
  const lunchOut = formatScheduleTime(rules.lunchOutTime, settings);
  const lunchIn = formatScheduleTime(rules.lunchInTime, settings);
  const dayOut = formatScheduleTime(rules.dayOutTime, settings);
  return `Day ${dayIn}–${dayOut} · Lunch ${lunchOut}–${lunchIn} · Target ${rules.targetHours}h`;
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

function comparePunchToThreshold(
  punch: ApiAttendancePunch | null,
  thresholdMinutes: number,
): { isEarly: boolean; isLate: boolean } {
  if (!punch) return { isEarly: false, isLate: false };
  const mins = punchMinutesOfDay(punch.at);
  return {
    isEarly: mins < thresholdMinutes,
    isLate: mins > thresholdMinutes,
  };
}

/**
 * Compares a driver's punches for one day against the global attendance
 * schedule from Settings → Attendance rules.
 */
export function evaluateDayScheduleCompliance(
  day: ApiAttendanceDay,
  rules: ApiAttendanceRules,
  todayKey: string,
): DayScheduleFlags {
  if (day.status === "ON_LEAVE") return { ...EMPTY_FLAGS };

  const thresholds = getScheduleThresholds(rules);
  const isPast = day.date < todayKey;
  const punches = toLivePunches(day);

  const dayIn = firstPunchOfType(punches, "DAY_IN");
  const dayOut = latestPunchByType(punches, "DAY_OUT");
  const lunchOut = firstPunchOfType(punches, "LUNCH_OUT");
  const lunchIn = latestPunchByType(punches, "LUNCH_IN");

  const flags: DayScheduleFlags = { ...EMPTY_FLAGS };

  if (isPast && !dayIn) {
    flags.missedCheckIn = true;
  }
  if (isPast && !!dayIn && !dayOut) {
    flags.missedCheckOut = true;
  }

  const dayInTiming = comparePunchToThreshold(dayIn, thresholds.dayIn);
  flags.earlyCheckIn = dayInTiming.isEarly;
  flags.lateCheckIn = dayInTiming.isLate;

  const dayOutTiming = comparePunchToThreshold(dayOut, thresholds.dayOut);
  flags.earlyCheckOut = dayOutTiming.isEarly;
  flags.lateCheckOut = dayOutTiming.isLate;

  const lunchOutTiming = comparePunchToThreshold(lunchOut, thresholds.lunchOut);
  flags.earlyLunchOut = lunchOutTiming.isEarly;
  flags.lateLunchOut = lunchOutTiming.isLate;

  const lunchInTiming = comparePunchToThreshold(lunchIn, thresholds.lunchIn);
  flags.earlyLunchReturn = lunchInTiming.isEarly;
  flags.lateLunchReturn = lunchInTiming.isLate;

  // Past days with a full shift but no lunch punches recorded.
  if (isPast && dayIn && dayOut && !lunchOut) {
    flags.missedLunchOut = true;
  }
  if (isPast && lunchOut && !lunchIn) {
    flags.missedLunchReturn = true;
  }

  if (dayIn && !dayOut) {
    flags.openLunchBreak = countOpen(punches, "LUNCH_OUT", "LUNCH_IN") > 0;
    flags.openMaintBreak = countOpen(punches, "MAINT_OUT", "MAINT_IN") > 0;
  }

  return flags;
}

const PUNCH_SCHEDULE_MAP: Partial<
  Record<AttendancePunchType, keyof ScheduleThresholds>
> = {
  DAY_IN: "dayIn",
  DAY_OUT: "dayOut",
  LUNCH_OUT: "lunchOut",
  LUNCH_IN: "lunchIn",
};

/** Per-punch early/late vs the expected schedule time for that punch type. */
export function getPunchScheduleTiming(
  punch: ApiAttendancePunch,
  rules: ApiAttendanceRules,
): PunchScheduleTiming | null {
  const key = PUNCH_SCHEDULE_MAP[punch.type];
  if (!key) return null;
  const threshold = getScheduleThresholds(rules)[key];
  const { isEarly, isLate } = comparePunchToThreshold(punch, threshold);
  return {
    punchType: punch.type,
    isEarly,
    isLate,
  };
}
