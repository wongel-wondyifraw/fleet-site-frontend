// Shared helpers for the per-day "target working hours" setting. The
// attendance management page exposes a small editor to tweak the value
// per calendar date (e.g. 6h for a half-day); the per-driver detail
// page reads the same map so its stats and chart agree with what the
// timekeeper sees on the roster.
//
// Storage shape:
//   { "YYYY-MM-DD": number, ... }
// Values are non-negative hours; missing keys fall back to
// DEFAULT_TARGET_HOURS (a standard 8-hour day).

export const DEFAULT_TARGET_HOURS = 8;
export const HOURS_TARGET_STORAGE_KEY = "fleetsite.attendance.targetHours.v1";

export type TargetHoursMap = Record<string, number>;

export function readStoredTargets(): TargetHoursMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(HOURS_TARGET_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: TargetHoursMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeStoredTargets(map: TargetHoursMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      HOURS_TARGET_STORAGE_KEY,
      JSON.stringify(map),
    );
  } catch {
    // Storage may be unavailable (private mode, quota); we silently
    // drop the write — the in-memory state still reflects the change
    // for the current session.
  }
}

// Resolve the effective target for a specific calendar date, applying
// the per-day override if present and the global default otherwise.
export function targetHoursForDate(
  map: TargetHoursMap,
  dateKey: string,
): number {
  const v = map[dateKey];
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_TARGET_HOURS;
}
