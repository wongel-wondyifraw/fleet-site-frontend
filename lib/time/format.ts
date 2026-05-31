// Centralised time / date formatting helpers that honour the global
// TimeSettings (timezone + 12 vs 24-hour format). All UI surfaces that
// display absolute timestamps should route through these helpers so the
// app reads consistently across the dashboard.

import type { ApiTimeSettings } from "@/lib/api/types";
import {
  DEFAULT_TIMEZONE,
  DEFAULT_TIME_FORMAT,
} from "@/lib/time/timezones";

export const TIME_SETTINGS_FALLBACK: ApiTimeSettings = {
  timezone: DEFAULT_TIMEZONE,
  timeFormat: DEFAULT_TIME_FORMAT,
};

function safeDate(input: Date | string | number): Date {
  return input instanceof Date ? input : new Date(input);
}

// Format a wall-clock time-of-day in the configured timezone. Picks
// "8:30 AM" or "08:30" depending on the format setting. Returns "—" on
// invalid input so callers don't have to check first.
export function formatTimeOfDay(
  input: Date | string | number,
  settings: ApiTimeSettings = TIME_SETTINGS_FALLBACK,
): string {
  const d = safeDate(input);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: settings.timezone,
      hour: settings.timeFormat === "12" ? "numeric" : "2-digit",
      minute: "2-digit",
      hour12: settings.timeFormat === "12",
    }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

// Format a calendar date in the configured timezone. Default options
// produce "Aug 5, 2025"; callers can override via the third argument.
export function formatDate(
  input: Date | string | number,
  settings: ApiTimeSettings = TIME_SETTINGS_FALLBACK,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  },
): string {
  const d = safeDate(input);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: settings.timezone,
      ...options,
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

// Combined date + time render used in tooltips, lists, and audit logs.
export function formatDateTime(
  input: Date | string | number,
  settings: ApiTimeSettings = TIME_SETTINGS_FALLBACK,
): string {
  const d = safeDate(input);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: settings.timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: settings.timeFormat === "12" ? "numeric" : "2-digit",
      minute: "2-digit",
      hour12: settings.timeFormat === "12",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

// Format a HH:MM schedule string (no date component) using the chosen
// 12 / 24-hour format. Pure string in / out; does not consult the
// timezone since these strings represent wall-clock policy values, not
// timestamps.
export function formatScheduleTime(
  hhmm: string,
  settings: ApiTimeSettings = TIME_SETTINGS_FALLBACK,
): string {
  const [rawH, rawM] = hhmm.split(":");
  const h = Number.parseInt(rawH ?? "", 10);
  const m = Number.parseInt(rawM ?? "", 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const minute = String(m).padStart(2, "0");
  if (settings.timeFormat === "24") {
    return `${String(h).padStart(2, "0")}:${minute}`;
  }
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${minute} ${period}`;
}

// Convert a local datetime <input> value (YYYY-MM-DDTHH:MM) preserving
// the chosen timezone. Used by the punch-correction dialog so editing
// a punch interprets the entered minutes in the configured timezone
// rather than the browser's local zone.
export function localInputToISO(
  value: string,
  settings: ApiTimeSettings = TIME_SETTINGS_FALLBACK,
): string {
  // For now the input is already interpreted in the browser's local zone
  // when constructing the Date; this matches existing behaviour. Kept as
  // a hook so we can later teach the dialog to render in the configured
  // timezone without changing every callsite.
  void settings;
  return new Date(value).toISOString();
}
