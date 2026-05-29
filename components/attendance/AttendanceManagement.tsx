"use client";

import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Coffee,
  Filter,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  Search,
  Trash2,
  Users,
  Wrench,
  X,
} from "@/lib/icons";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SettingsSection, fieldClass } from "@/components/settings/SettingsShared";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  createAttendancePunch,
  deleteAttendancePunch,
  listAttendanceRoster,
  updateAttendancePunch,
} from "@/lib/api/attendance";
import { ApiError } from "@/lib/api/client";
import { listDrivers } from "@/lib/api/drivers";
import { listSites } from "@/lib/api/sites";
import { listTrips } from "@/lib/api/trips";
import {
  DEFAULT_TARGET_HOURS,
  readStoredTargets,
  writeStoredTargets,
} from "@/lib/attendance-targets";
import type {
  ApiAttendanceDay,
  ApiAttendancePunch,
  ApiDriver,
  ApiSite,
  AttendanceDayStatus,
  AttendancePunchType,
} from "@/lib/api/types";
import { cn } from "@/lib/utils";

type DateFilter = "TODAY" | "YESTERDAY" | "CUSTOM";
type StatusFilter = AttendanceDayStatus | "ALL";

const ALL_SITES_TAB = "__ALL__";
const UNASSIGNED_TAB = "__UNASSIGNED__";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "EXPECTED", label: "Expected" },
  { value: "PRESENT", label: "Present" },
  { value: "ON_BREAK", label: "On Break" },
  { value: "DONE", label: "Done" },
  { value: "ABSENT", label: "Absent" },
  { value: "ON_LEAVE", label: "On Leave" },
];

const STATUS_STYLES: Record<AttendanceDayStatus, string> = {
  EXPECTED: "bg-slate-100 text-slate-700",
  PRESENT: "bg-blue-50 text-blue-700",
  ON_BREAK: "bg-amber-50 text-amber-700",
  DONE: "bg-emerald-50 text-emerald-700",
  ABSENT: "bg-rose-50 text-rose-700",
  ON_LEAVE: "bg-orange-50 text-orange-700",
};

// Human label per autoCloseReason code the backend emits. Keep the keys in
// sync with the constants in AttendanceService (AUTO_CLOSE_*). Unknown
// codes fall back to a generic "Auto-closed" badge so a future backend
// addition doesn't render as a blank chip.
const AUTO_CLOSE_REASON_LABELS: Record<string, string> = {
  MISSING_DAY_OUT: "No day out",
  MISSING_LUNCH_RETURN: "Afternoon absent",
  MISSING_MAINT_RETURN: "Maint not closed",
};

type FeatherIcon = ComponentType<SVGProps<SVGSVGElement>>;

const PUNCH_PAIRS: {
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

// Punch types that require an odometer reading from the timekeeper. These
// are the four events that bracket the morning + afternoon "work legs"
// the fuel module uses to compute per-shift distance:
//   morning  = LUNCH_OUT.odometer − DAY_IN.odometer
//   afternoon = DAY_OUT.odometer − LUNCH_IN.odometer
// Maintenance punches deliberately stay odometer-free — they happen mid-
// leg and would double-count if folded into the calculation.
const ODOMETER_REQUIRED_PUNCH_TYPES: ReadonlySet<AttendancePunchType> = new Set([
  "DAY_IN",
  "DAY_OUT",
  "LUNCH_OUT",
  "LUNCH_IN",
]);

function toLocalDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function prettyStatus(status: AttendanceDayStatus): string {
  return status.replace("_", " ");
}

function driverName(day: ApiAttendanceDay): string {
  const driver = day.driver;
  if (!driver) return "Unknown driver";
  const composed = `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim();
  return composed || driver.employeeId || "Unnamed driver";
}

function toLivePunches(day: ApiAttendanceDay): ApiAttendancePunch[] {
  return [...(day.punches ?? [])]
    .filter((p) => !p.isVoided)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function latestPunchByType(
  punches: ApiAttendancePunch[],
  type: AttendancePunchType,
): ApiAttendancePunch | null {
  for (let i = punches.length - 1; i >= 0; i -= 1) {
    if (punches[i].type === type) return punches[i];
  }
  return null;
}

function countOpen(
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

function isPairOpen(
  punches: ApiAttendancePunch[],
  outType: AttendancePunchType,
  inType: AttendancePunchType,
): boolean {
  return countOpen(punches, outType, inType) > 0;
}

function computeWorkedHours(day: ApiAttendanceDay, targetDateKey: string): number {
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

function formatPunchTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function fromLocalDateTimeInput(local: string): string {
  return new Date(local).toISOString();
}

function AttendancePanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  const [sites, setSites] = useState<ApiSite[]>([]);
  const [drivers, setDrivers] = useState<ApiDriver[]>([]);
  const [rosterDays, setRosterDays] = useState<ApiAttendanceDay[]>([]);
  // Driver IDs currently on an IN_PROGRESS trip. Used to gate break punches
  // (lunch / maintenance) — a driver can't be on a break while actively
  // driving a trip, so the corresponding buttons are disabled when their ID
  // appears here. Refreshed alongside the roster.
  const [activeTripDriverIds, setActiveTripDriverIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRosterLoading, setIsRosterLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(ALL_SITES_TAB);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("TODAY");
  const [customDate, setCustomDate] = useState(() => toLocalDateKey(new Date()));
  const [targetHoursMap, setTargetHoursMap] = useState<Record<string, number>>(
    () => readStoredTargets(),
  );
  const [siteMessage, setSiteMessage] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState<{
    dayId: string;
    pair: (typeof PUNCH_PAIRS)[number]["key"];
  } | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiAttendancePunch | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<{
    punch: ApiAttendancePunch;
    at: string;
    note: string;
  } | null>(null);
  // Odometer input that lives inside the currently-open punch dropdown.
  // `value` is the in-flight string the user is typing — kept as a string
  // so partial / decimal-in-progress inputs survive without being coerced
  // to NaN. Reset whenever the open dropdown changes so values don't bleed
  // from one driver's row into another.
  const [pendingOdometer, setPendingOdometer] = useState<{
    value: string;
    error: string | null;
  }>({ value: "", error: null });

  // Centralised closer that also clears the in-dropdown odometer input so
  // a half-typed value doesn't survive when the menu reopens later.
  const closeActionMenu = useCallback(() => {
    setActionMenu(null);
    setPendingOdometer({ value: "", error: null });
  }, []);

  // Close any open punch dropdown when the user clicks outside of it or
  // presses Escape. Each toggle wrapper is tagged with
  // `data-action-menu="true"` so a single document-level listener can
  // dismiss the menu cleanly without every row needing its own ref.
  useEffect(() => {
    if (!actionMenu) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('[data-action-menu="true"]')) {
        closeActionMenu();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeActionMenu();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [actionMenu, closeActionMenu]);

  const targetDateKey = useMemo(() => {
    if (dateFilter === "TODAY") return toLocalDateKey(new Date());
    if (dateFilter === "YESTERDAY") {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return toLocalDateKey(d);
    }
    return customDate;
  }, [dateFilter, customDate]);

  const targetHours = targetHoursMap[targetDateKey] ?? DEFAULT_TARGET_HOURS;
  const isTargetOverride = targetHoursMap[targetDateKey] !== undefined;

  const sortedSites = useMemo(
    () => [...sites].sort((a, b) => a.name.localeCompare(b.name)),
    [sites],
  );
  const knownSiteNames = useMemo(() => new Set(sites.map((s) => s.name)), [sites]);
  const hasUnassignedDrivers = useMemo(
    () => drivers.some((d) => !d.homeSite || !knownSiteNames.has(d.homeSite)),
    [drivers, knownSiteNames],
  );

  // Only ACTIVE drivers ever appear in a roster (the backend filters by
  // DriverStatus.ACTIVE). Counting all drivers would inflate the tab badges
  // relative to the rows the user actually sees, so we mirror that filter
  // here. The All-sites count is the sum of every concrete site's roster
  // (unassigned drivers never appear in a site roster) which is exactly
  // what the merged "All sites" view shows.
  const tabCounts = useMemo(() => {
    const map = new Map<string, number>();
    const activeDrivers = drivers.filter((d) => d.status === "ACTIVE");
    let unassigned = 0;
    let knownSiteTotal = 0;
    for (const s of sortedSites) {
      const count = activeDrivers.filter((d) => d.homeSite === s.name).length;
      map.set(s.id, count);
      knownSiteTotal += count;
    }
    for (const d of activeDrivers) {
      const site = d.homeSite ?? "";
      if (!site || !knownSiteNames.has(site)) unassigned += 1;
    }
    map.set(ALL_SITES_TAB, knownSiteTotal);
    map.set(UNASSIGNED_TAB, unassigned);
    return map;
  }, [drivers, sortedSites, knownSiteNames]);

  const resolvedSiteId = useMemo(() => {
    if (activeTab === ALL_SITES_TAB) return null;
    if (activeTab === UNASSIGNED_TAB) return null;
    return sortedSites.some((s) => s.id === activeTab) ? activeTab : null;
  }, [activeTab, sortedSites]);

  const activeSiteLabel =
    activeTab === ALL_SITES_TAB
      ? "All sites"
      : activeTab === UNASSIGNED_TAB
        ? "Unassigned"
        : (sortedSites.find((s) => s.id === activeTab)?.name ?? "Site");

  // Refresh the set of drivers currently on an IN_PROGRESS trip. Soft-fails
  // on auth/network errors — the roster is still useful without this, the
  // worst case is the break-punch buttons stay enabled when they should be
  // disabled. We never surface the trip fetch error to the user because it
  // would obscure roster-load errors that matter more.
  const refreshActiveTrips = useCallback(async () => {
    try {
      const trips = await listTrips({ status: "IN_PROGRESS" });
      const ids = new Set<string>();
      for (const trip of trips) {
        if (trip.driverId) ids.add(trip.driverId);
      }
      setActiveTripDriverIds(ids);
    } catch {
      // Soft-fail: leave the previous snapshot in place.
    }
  }, []);

  const refreshBase = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [s, d] = await Promise.all([
        listSites().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiSite[];
          throw err;
        }),
        listDrivers().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiDriver[];
          throw err;
        }),
        refreshActiveTrips(),
      ]);
      setSites(s);
      setDrivers(d);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load attendance data.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [refreshActiveTrips]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refreshBase();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refreshBase]);

  const refreshRoster = useCallback(async () => {
    // Re-snapshot the active-trip set on every roster refresh. We don't
    // await it before kicking off the roster call (the roster is the
    // important payload) — running in parallel keeps the UI snappy.
    void refreshActiveTrips();

    // "All sites" doesn't map to a single backend siteId, so we fan out and
    // merge the per-site rosters. Without this fan-out the All-sites tab
    // only showed the first site's roster while the tab badge advertised the
    // grand total - confusing and the source of the "numbers don't match"
    // bug.
    if (activeTab === ALL_SITES_TAB) {
      if (sortedSites.length === 0) {
        setRosterDays([]);
        setSiteMessage("No sites configured yet. Create a site to load roster.");
        return;
      }
      setIsRosterLoading(true);
      setLoadError(null);
      setSiteMessage(null);
      try {
        const results = await Promise.all(
          sortedSites.map((site) =>
            listAttendanceRoster({
              date: targetDateKey,
              siteId: site.id,
              status: statusFilter === "ALL" ? undefined : statusFilter,
              search: searchQuery.trim() || undefined,
            }).catch((err) => {
              if (err instanceof ApiError && err.isAuth) return [] as ApiAttendanceDay[];
              throw err;
            }),
          ),
        );
        setRosterDays(results.flat());
      } catch (err) {
        setLoadError(
          err instanceof ApiError ? err.message : "Unable to load attendance roster.",
        );
        setRosterDays([]);
      } finally {
        setIsRosterLoading(false);
      }
      return;
    }

    if (!resolvedSiteId) {
      setRosterDays([]);
      if (activeTab === UNASSIGNED_TAB) {
        setSiteMessage("Attendance roster requires a concrete site. Choose a site tab.");
      } else if (sortedSites.length === 0) {
        setSiteMessage("No site selected yet. Create or select a site to load roster.");
      } else {
        setSiteMessage("No site selected yet.");
      }
      return;
    }
    setIsRosterLoading(true);
    setLoadError(null);
    setSiteMessage(null);
    try {
      const rows = await listAttendanceRoster({
        date: targetDateKey,
        siteId: resolvedSiteId,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        search: searchQuery.trim() || undefined,
      });
      setRosterDays(rows);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load attendance roster.",
      );
      setRosterDays([]);
    } finally {
      setIsRosterLoading(false);
    }
  }, [
    refreshActiveTrips,
    resolvedSiteId,
    activeTab,
    sortedSites,
    targetDateKey,
    statusFilter,
    searchQuery,
  ]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refreshRoster();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refreshRoster]);

  function handleSaveTargetHours(next: number) {
    if (!Number.isFinite(next) || next < 0) return;
    const clamped = Math.min(24, next);
    setTargetHoursMap((prev) => {
      const updated = { ...prev, [targetDateKey]: clamped };
      writeStoredTargets(updated);
      return updated;
    });
  }

  function handleResetTargetHours() {
    setTargetHoursMap((prev) => {
      if (prev[targetDateKey] === undefined) return prev;
      const updated = { ...prev };
      delete updated[targetDateKey];
      writeStoredTargets(updated);
      return updated;
    });
  }

  function upsertDay(nextDay: ApiAttendanceDay) {
    setRosterDays((prev) => {
      const idx = prev.findIndex((d) => d.id === nextDay.id);
      if (idx < 0) return prev;
      const copy = [...prev];
      copy[idx] = nextDay;
      return copy;
    });
  }

  async function handlePunch(day: ApiAttendanceDay, type: AttendancePunchType) {
    // For the four odometer-required punch types the in-dropdown form
    // collects the reading first and re-enters this handler with a
    // validated value (see handleSubmitPunch below). Calling this path
    // without an odometer for those types is a programming error — we
    // surface it as an inline error rather than silently dropping the
    // request.
    if (ODOMETER_REQUIRED_PUNCH_TYPES.has(type)) {
      setPendingOdometer({
        value: pendingOdometer.value,
        error: "Enter an odometer reading before submitting this punch.",
      });
      return;
    }
    setIsMutating(true);
    setLoadError(null);
    try {
      const updated = await createAttendancePunch(day.id, { type });
      upsertDay(updated);
      closeActionMenu();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Unable to create punch.");
    } finally {
      setIsMutating(false);
    }
  }

  // Submits a punch that requires an odometer reading. Called by the
  // in-dropdown "Submit" button. Validates and rounds the reading the
  // same way the previous modal flow did before sending it to the API.
  async function handleSubmitPunchWithOdometer(
    day: ApiAttendanceDay,
    type: AttendancePunchType,
  ) {
    // Allow comma decimal separators ("123,45") for locales that use them.
    const normalised = pendingOdometer.value.trim().replace(",", ".");
    const parsed = Number.parseFloat(normalised);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setPendingOdometer({
        value: pendingOdometer.value,
        error: "Enter a non-negative odometer reading in kilometres.",
      });
      return;
    }
    // Two decimals max — matches the backend column precision so we can't
    // round-trip a value the API would reject.
    const rounded = Math.round(parsed * 100) / 100;
    setIsMutating(true);
    setLoadError(null);
    try {
      const updated = await createAttendancePunch(day.id, {
        type,
        odometer: rounded,
      });
      upsertDay(updated);
      closeActionMenu();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Unable to create punch.";
      // Keep the dropdown open and surface the error inline so the user
      // can fix the value without losing what they typed.
      setPendingOdometer({ value: pendingOdometer.value, error: message });
    } finally {
      setIsMutating(false);
    }
  }

  async function handleDeletePunch(punchId: string) {
    setIsMutating(true);
    setLoadError(null);
    try {
      const updated = await deleteAttendancePunch(punchId);
      upsertDay(updated);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Unable to delete punch.");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleCorrectionSave() {
    if (!correctionTarget) return;
    setIsMutating(true);
    setLoadError(null);
    try {
      const updated = await updateAttendancePunch(correctionTarget.punch.id, {
        at: fromLocalDateTimeInput(correctionTarget.at),
        note: correctionTarget.note.trim() || null,
      });
      upsertDay(updated);
      setCorrectionTarget(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Unable to update punch.");
    } finally {
      setIsMutating(false);
    }
  }

  const rosterSummary = useMemo(() => {
    const summary: Record<"EXPECTED" | "PRESENT" | "ON_BREAK" | "DONE" | "ABSENT", number> = {
      EXPECTED: 0,
      PRESENT: 0,
      ON_BREAK: 0,
      DONE: 0,
      ABSENT: 0,
    };
    for (const row of rosterDays) {
      if (row.status in summary) summary[row.status as keyof typeof summary] += 1;
    }
    return summary;
  }, [rosterDays]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-primary">{rosterDays.length}</span> roster rows
            shown for <span className="font-semibold text-primary">{activeSiteLabel}</span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <div className="relative w-full sm:flex-1 sm:min-w-[18rem] sm:max-w-4xl">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or ID"
                aria-label="Search drivers by name"
                className={`${fieldClass} pl-9 ${searchQuery ? "pr-9" : ""}`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-slate-100 hover:text-primary"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-2 sm:hidden">
              <div className="relative flex-1">
                <Filter className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className={`${fieldClass} pl-9`}
                  aria-label="Filter by attendance status"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative flex-1">
                <AttendanceDateFilterMenu
                  value={dateFilter}
                  onChange={setDateFilter}
                  customDate={customDate}
                  onCustomDateChange={setCustomDate}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 sm:contents">
          <div className="min-w-0 flex-1 sm:hidden">
            <TargetHoursEditor
              value={targetHours}
              isOverride={isTargetOverride}
              onSave={handleSaveTargetHours}
              onReset={handleResetTargetHours}
            />
          </div>
          <Button
            onClick={refreshRoster}
            disabled={isRosterLoading || isMutating}
            className="h-10 shrink-0 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint sm:self-end"
          >
            {isRosterLoading ? <Loader2 className="size-4 animate-spin" /> : <Clock className="size-4" />}
            Refresh roster
          </Button>
        </div>
      </div>

      {(loadError || siteMessage) && (
        <div
          className={cn(
            "rounded-xl px-3 py-2.5 text-sm",
            loadError
              ? "border border-rose-200 bg-rose-50/80 text-rose-800"
              : "border border-amber-200 bg-amber-50/80 text-amber-800",
          )}
        >
          {loadError ?? siteMessage}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="-mx-1 min-w-0 flex-1 overflow-x-auto pb-1">
          <div
            role="tablist"
            aria-label="Filter attendance by site"
            className="mx-1 inline-flex min-w-max items-center gap-1 rounded-xl border border-primary/20 bg-primary/5 p-1 shadow-sm shadow-primary/10"
          >
            <SiteTab
              label="All sites"
              count={tabCounts.get(ALL_SITES_TAB) ?? 0}
              active={activeTab === ALL_SITES_TAB}
              onClick={() => setActiveTab(ALL_SITES_TAB)}
            />
            {sortedSites.map((site) => (
              <SiteTab
                key={site.id}
                label={site.name}
                count={tabCounts.get(site.id) ?? 0}
                active={activeTab === site.id}
                onClick={() => setActiveTab(site.id)}
              />
            ))}
            {hasUnassignedDrivers && (
              <SiteTab
                label="Unassigned"
                count={tabCounts.get(UNASSIGNED_TAB) ?? 0}
                active={activeTab === UNASSIGNED_TAB}
                onClick={() => setActiveTab(UNASSIGNED_TAB)}
              />
            )}
          </div>
        </div>
        <div className="hidden shrink-0 sm:block">
          <RosterSummaryPill summary={rosterSummary} />
        </div>
      </div>

      <div className="hidden flex-col gap-2 sm:flex sm:flex-row sm:items-center sm:gap-3">
        <AttendanceDateTabs
          value={dateFilter}
          onChange={setDateFilter}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
        />
        <div className="relative w-52 shrink-0">
          <Filter className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={`${fieldClass} pl-9`}
            aria-label="Filter by attendance status"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <TargetHoursEditor
          value={targetHours}
          isOverride={isTargetOverride}
          onSave={handleSaveTargetHours}
          onReset={handleResetTargetHours}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : rosterDays.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
          <Users className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-primary">No roster rows found.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try another site, date, search term, or status filter.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {rosterDays.map((day) => (
            <DriverAttendanceRow
              key={day.id}
              day={day}
              dateKey={targetDateKey}
              targetHours={targetHours}
              density={density}
              actionMenu={actionMenu}
              isOnActiveTrip={
                day.driverId ? activeTripDriverIds.has(day.driverId) : false
              }
              pendingOdometer={pendingOdometer}
              onChangeOdometer={(value) =>
                setPendingOdometer({ value, error: null })
              }
              onToggleMenu={(pair) => {
                const isSame =
                  actionMenu?.dayId === day.id && actionMenu.pair === pair;
                if (isSame) {
                  closeActionMenu();
                  return;
                }
                setActionMenu({ dayId: day.id, pair });
                setPendingOdometer({ value: "", error: null });
              }}
              onPunch={handlePunch}
              onPunchWithOdometer={handleSubmitPunchWithOdometer}
              onEditPunch={(punch) =>
                setCorrectionTarget({
                  punch,
                  at: toLocalDateTimeInput(punch.at),
                  note: punch.note ?? "",
                })
              }
              onDeletePunch={(punch) => setDeleteTarget(punch)}
              isMutating={isMutating}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Void this punch?"
        description="The punch will be marked voided and excluded from roster calculations."
        confirmLabel="Void punch"
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return;
          await handleDeletePunch(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />

      <AlertDialog
        open={correctionTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isMutating) setCorrectionTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Correct punch</AlertDialogTitle>
          </AlertDialogHeader>
          {correctionTarget && (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Time
                </span>
                <input
                  type="datetime-local"
                  value={correctionTarget.at}
                  onChange={(e) =>
                    setCorrectionTarget((prev) =>
                      prev ? { ...prev, at: e.target.value } : prev,
                    )
                  }
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Note
                </span>
                <input
                  type="text"
                  value={correctionTarget.note}
                  onChange={(e) =>
                    setCorrectionTarget((prev) =>
                      prev ? { ...prev, note: e.target.value } : prev,
                    )
                  }
                  placeholder="Optional correction note"
                  className={fieldClass}
                />
              </label>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={handleCorrectionSave}
              disabled={isMutating || !correctionTarget?.at}
              className="h-10 gap-2 rounded-xl px-4 text-sm font-semibold"
            >
              {isMutating ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

function TargetHoursEditor({
  value,
  isOverride,
  onSave,
  onReset,
}: {
  value: number;
  isOverride: boolean;
  onSave: (next: number) => void;
  onReset: () => void;
}) {
  function step(delta: number) {
    const next = Math.max(0, Math.min(24, value + delta));
    if (next === value) return;
    onSave(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm">
      <span className="text-[10px] font-semibold tracking-wide text-primary/70 uppercase">
        Target hours
      </span>
      <div className="flex items-stretch overflow-hidden rounded-md border border-primary/30 bg-white">
        <input
          type="number"
          min={0}
          max={24}
          step={0.5}
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const parsed = Number.parseFloat(e.target.value);
            if (!Number.isFinite(parsed)) return;
            const next = Math.max(0, Math.min(24, parsed));
            onSave(next);
          }}
          aria-label="Target working hours for the selected day"
          className="w-14 border-0 bg-transparent px-2 py-0.5 text-center text-sm font-bold text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0"
        />
        <div className="flex flex-col border-l border-primary/30">
          <button
            type="button"
            onClick={() => step(0.5)}
            aria-label="Increase target hours"
            className="flex h-1/2 w-6 items-center justify-center bg-primary text-white transition-colors hover:bg-primary/90 active:bg-primary/80"
          >
            <ChevronUp className="size-3.5" strokeWidth={3} />
          </button>
          <button
            type="button"
            onClick={() => step(-0.5)}
            aria-label="Decrease target hours"
            className="flex h-1/2 w-6 items-center justify-center border-t border-white/30 bg-primary text-white transition-colors hover:bg-primary/90 active:bg-primary/80"
          >
            <ChevronDown className="size-3.5" strokeWidth={3} />
          </button>
        </div>
      </div>
      <span className="text-[11px] text-primary/70">hours / driver</span>
      {isOverride && (
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] font-semibold text-primary/70 underline-offset-2 hover:text-primary hover:underline"
        >
          Reset to default ({DEFAULT_TARGET_HOURS}h)
        </button>
      )}
    </div>
  );
}

function RosterSummaryPill({
  summary,
}: {
  summary: Record<"EXPECTED" | "PRESENT" | "ON_BREAK" | "DONE" | "ABSENT", number>;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
      <span>
        Expected <span className="text-primary tabular-nums">{summary.EXPECTED}</span>
      </span>
      <span>
        Present <span className="text-primary tabular-nums">{summary.PRESENT}</span>
      </span>
      <span>
        OnBreak <span className="text-primary tabular-nums">{summary.ON_BREAK}</span>
      </span>
      <span>
        Done <span className="text-primary tabular-nums">{summary.DONE}</span>
      </span>
      <span>
        Absent <span className="text-primary tabular-nums">{summary.ABSENT}</span>
      </span>
    </span>
  );
}

function SiteTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
          : "text-primary/80 hover:bg-primary/10 hover:text-primary",
      )}
    >
      <span className="truncate">{label}</span>
      <span
        className={cn(
          "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
          active ? "bg-white/20 text-primary-foreground" : "bg-primary/10 text-primary",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function DriverAttendanceRow({
  day,
  dateKey,
  targetHours,
  density,
  actionMenu,
  isOnActiveTrip,
  pendingOdometer,
  onChangeOdometer,
  onToggleMenu,
  onPunch,
  onPunchWithOdometer,
  onEditPunch,
  onDeletePunch,
  isMutating,
}: {
  day: ApiAttendanceDay;
  dateKey: string;
  targetHours: number;
  density: "comfortable" | "compact";
  actionMenu: { dayId: string; pair: "day" | "lunch" | "maint" } | null;
  isOnActiveTrip: boolean;
  pendingOdometer: { value: string; error: string | null };
  onChangeOdometer: (value: string) => void;
  onToggleMenu: (pair: "day" | "lunch" | "maint") => void;
  onPunch: (day: ApiAttendanceDay, type: AttendancePunchType) => Promise<void>;
  onPunchWithOdometer: (
    day: ApiAttendanceDay,
    type: AttendancePunchType,
  ) => Promise<void>;
  onEditPunch: (punch: ApiAttendancePunch) => void;
  onDeletePunch: (punch: ApiAttendancePunch) => void;
  isMutating: boolean;
}) {
  const punches = toLivePunches(day);
  const worked = computeWorkedHours(day, dateKey);
  const metTarget = worked >= targetHours;
  const dayOpen = isPairOpen(punches, "DAY_IN", "DAY_OUT");
  const lunchOpen = isPairOpen(punches, "LUNCH_OUT", "LUNCH_IN");
  const maintOpen = isPairOpen(punches, "MAINT_OUT", "MAINT_IN");
  // workDistanceKm is sent as a numeric string by Postgres; parse it
  // defensively so a stray null / undefined / non-numeric doesn't blow up
  // the row. We treat it as "not yet computed" when no readings have been
  // captured.
  const distanceKmRaw =
    day.workDistanceKm !== null && day.workDistanceKm !== undefined
      ? Number.parseFloat(String(day.workDistanceKm))
      : NaN;
  const hasDistance = Number.isFinite(distanceKmRaw) && distanceKmRaw > 0;
  const anyBreakOpen = lunchOpen || maintOpen;
  const hasDayIn = punches.some((p) => p.type === "DAY_IN");
  const hasDayOut = punches.some((p) => p.type === "DAY_OUT");

  function nextAction(pair: "day" | "lunch" | "maint"): {
    label: string;
    type: AttendancePunchType;
  } | null {
    if (pair === "day") {
      if (!hasDayIn) return { label: "Punch in", type: "DAY_IN" };
      if (!hasDayOut && !anyBreakOpen) return { label: "Punch out", type: "DAY_OUT" };
      return null;
    }
    if (pair === "lunch") {
      if (!hasDayIn || hasDayOut) return null;
      if (lunchOpen) return { label: "End lunch", type: "LUNCH_IN" };
      if (!anyBreakOpen) return { label: "Start lunch", type: "LUNCH_OUT" };
      return null;
    }
    if (!hasDayIn || hasDayOut) return null;
    if (maintOpen) return { label: "End maint", type: "MAINT_IN" };
    if (!anyBreakOpen) return { label: "Start maint", type: "MAINT_OUT" };
    return null;
  }

  function pairState(pair: "day" | "lunch" | "maint"): "IN" | "OUT" | "IDLE" {
    if (pair === "day") return dayOpen ? "IN" : hasDayOut ? "OUT" : "IDLE";
    if (pair === "lunch") return lunchOpen ? "OUT" : "IN";
    return maintOpen ? "OUT" : "IN";
  }

  return (
    <article
      className={cn(
        "rounded-xl border border-slate-100 bg-slate-50/50 transition-colors",
        density === "compact" ? "p-3" : "p-4",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left half: the driver identity + status badges. Wrapped in a
            Link so the timekeeper can click through to the per-driver
            history page. We deliberately *don't* wrap the whole article
            in a Link — the right half holds interactive punch buttons
            and a Link ancestor would swallow their clicks. The hover
            background gives a subtle "this is clickable" cue. */}
        <Link
          href={`/dashboard/attendance/drivers/${day.driverId}`}
          className="group flex min-w-0 items-center gap-3 rounded-lg -mx-1 px-1 py-1 transition-colors hover:bg-primary/5"
          aria-label={`Open attendance detail for ${driverName(day)}`}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
            {day.driver?.firstName?.[0] ?? "?"}
            {day.driver?.lastName?.[0] ?? ""}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-primary group-hover:underline">
                {driverName(day)}
              </p>
              <ChevronRight className="size-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              <span
                className={cn(
                  "inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                  STATUS_STYLES[day.status],
                )}
              >
                {prettyStatus(day.status)}
              </span>
              {day.autoClosedAt &&
                (day.autoCloseReason ?? "")
                  .split(",")
                  .map((code) => code.trim())
                  .filter(Boolean)
                  .map((code) => (
                    <span
                      key={code}
                      title={`System auto-closed this day at ${new Date(day.autoClosedAt as string).toLocaleString()}`}
                      className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-800 uppercase ring-1 ring-amber-300/60"
                    >
                      <AlertTriangle className="size-2.5" />
                      {AUTO_CLOSE_REASON_LABELS[code] ?? "Auto-closed"}
                    </span>
                  ))}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {day.driver?.employeeId ?? "No employee ID"}
            </p>
          </div>
        </Link>
        <div className="flex flex-wrap items-end justify-start gap-2 lg:justify-end lg:shrink-0">
          {PUNCH_PAIRS.map((pair) => {
            // Break pairs (Lunch / Maintenance) only make sense once the
            // driver is on the clock — the backend rejects LUNCH_OUT and
            // MAINT_OUT without a prior DAY_IN, so we hide them entirely
            // instead of showing a button that can never be used.
            const isBreakPair = pair.key === "lunch" || pair.key === "maint";
            if (isBreakPair && !hasDayIn) return null;

            const open = actionMenu?.dayId === day.id && actionMenu.pair === pair.key;
            const state = pairState(pair.key);
            const next = nextAction(pair.key);
            const pairPunches = punches.filter(
              (p) => p.type === pair.outType || p.type === pair.inType,
            );
            const PairIcon = pair.Icon;
            // Break punches conflict with an in-progress trip — you can't
            // start/end a lunch while you're physically driving — so we
            // disable the action button when the driver has an active trip.
            // The pill stays clickable so the user can still inspect past
            // punches; only the next-punch action is blocked.
            const blockedByTrip = isBreakPair && isOnActiveTrip;
            // State is communicated by the colour of the icon + label only:
            // IN uses a deep emerald so it reads as "active/clocked in", OUT
            // uses a softer rose so a finished/ended state doesn't shout, and
            // IDLE inherits the muted primary so it stays neutral until the
            // first punch lands.
            const stateClass =
              state === "IN"
                ? "text-emerald-700"
                : state === "OUT"
                  ? "text-rose-400"
                  : "text-primary/70";
            // Action icon for the dropdown next-punch button. The verbs map
            // cleanly to LogIn / LogOut so the icon reinforces what tapping
            // will actually do (LUNCH_OUT and MAINT_OUT are "leaving work" so
            // they get LogOut; LUNCH_IN / MAINT_IN come back to work so
            // they get LogIn).
            const NextIcon: FeatherIcon | null = next
              ? next.type === "DAY_IN" ||
                next.type === "LUNCH_IN" ||
                next.type === "MAINT_IN"
                ? LogIn
                : LogOut
              : null;
            return (
              <div
                key={pair.key}
                data-action-menu="true"
                className="relative flex flex-col items-center gap-1"
              >
                <span className="text-[10px] font-black tracking-wide text-primary/70 uppercase">
                  {pair.label}
                </span>
                <button
                  type="button"
                  onClick={() => onToggleMenu(pair.key)}
                  aria-label={
                    blockedByTrip
                      ? `${pair.label} (${state}) - driver is on an active trip`
                      : `${pair.label} (${state}) - tap to manage punches`
                  }
                  title={
                    blockedByTrip
                      ? "Driver is on an active trip"
                      : undefined
                  }
                  className={cn(
                    "group inline-flex w-24 items-center justify-between gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[11px] font-black shadow-sm shadow-primary/10 transition-colors hover:bg-primary/10 hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/40",
                    blockedByTrip && "opacity-70",
                  )}
                >
                  <span className={cn("inline-flex items-center gap-1.5", stateClass)}>
                    <PairIcon className="size-4" />
                    <span className="tracking-wide">{state}</span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-3 text-primary/60 transition-transform",
                      open && "rotate-180",
                    )}
                  />
                </button>
                {open && (
                  <div className="absolute top-full left-0 z-30 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                    {blockedByTrip ? (
                      <p className="px-2 py-1 text-[11px] font-medium text-rose-600">
                        Driver is on an active trip. Complete the trip before
                        recording a {pair.label.toLowerCase()} punch.
                      </p>
                    ) : next ? (
                      (() => {
                        const needsOdometer = ODOMETER_REQUIRED_PUNCH_TYPES.has(
                          next.type,
                        );
                        const trimmed = pendingOdometer.value.trim();
                        const submitDisabled =
                          isMutating || (needsOdometer && trimmed.length === 0);
                        return (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (needsOdometer) {
                                void onPunchWithOdometer(day, next.type);
                              } else {
                                void onPunch(day, next.type);
                              }
                            }}
                            className="space-y-2"
                          >
                            {needsOdometer && (
                              <label className="block">
                                <span className="mb-1 block text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
                                  Odometer (km)
                                </span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  min={0}
                                  autoFocus
                                  value={pendingOdometer.value}
                                  onChange={(e) => onChangeOdometer(e.target.value)}
                                  placeholder="e.g. 152340.50"
                                  aria-invalid={
                                    pendingOdometer.error ? true : undefined
                                  }
                                  className="block h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                                {pendingOdometer.error && (
                                  <span className="mt-1 block text-[10px] font-medium text-rose-600">
                                    {pendingOdometer.error}
                                  </span>
                                )}
                              </label>
                            )}
                            <Button
                              type="submit"
                              disabled={submitDisabled}
                              className="h-8 w-full justify-start gap-2 rounded-lg px-2 text-xs"
                            >
                              {isMutating ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : NextIcon ? (
                                <NextIcon className="size-3.5" />
                              ) : null}
                              {next.label}
                            </Button>
                          </form>
                        );
                      })()
                    ) : (
                      <p className="px-2 py-1 text-[11px] text-muted-foreground">
                        No action available
                      </p>
                    )}
                    <div className="mt-1 space-y-1 border-t border-slate-100 pt-1">
                      {pairPunches.length === 0 ? (
                        <p className="px-2 py-1 text-[11px] text-muted-foreground">No punches yet</p>
                      ) : (
                        pairPunches.map((p) => {
                          const isInPunch =
                            p.type === "DAY_IN" ||
                            p.type === "LUNCH_IN" ||
                            p.type === "MAINT_IN";
                          const HistoryIcon = isInPunch ? LogIn : LogOut;
                          return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[11px] text-slate-700"
                          >
                            <span className="inline-flex items-center gap-1.5 truncate">
                              <HistoryIcon
                                className={cn(
                                  "size-3 shrink-0",
                                  isInPunch ? "text-emerald-600" : "text-rose-500",
                                )}
                              />
                              <span className="truncate">
                                {p.type.replace("_", " ")} · {formatPunchTime(p.at)}
                              </span>
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className="rounded p-1 text-muted-foreground hover:bg-slate-100 hover:text-primary"
                                onClick={() => onEditPunch(p)}
                                aria-label="Edit punch"
                              >
                                <Pencil className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                className="rounded p-1 text-muted-foreground hover:bg-slate-100 hover:text-rose-600"
                                onClick={() => onDeletePunch(p)}
                                aria-label="Void punch"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <WorkedHoursDonut worked={worked} target={targetHours} />
          <span
            className={cn(
              "inline-flex flex-col items-center rounded-md border px-2 py-1 text-[10px] font-black tracking-wide uppercase",
              hasDistance
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-500",
            )}
            title={
              hasDistance
                ? `Work distance: (LUNCH_OUT − DAY_IN) + (DAY_OUT − LUNCH_IN) = ${distanceKmRaw.toFixed(2)} km`
                : "Capture odometer at DAY_IN / LUNCH_OUT / LUNCH_IN / DAY_OUT to compute distance"
            }
          >
            <span className="text-[9px] text-slate-500">Distance</span>
            <span className="text-xs tabular-nums">
              {hasDistance ? `${distanceKmRaw.toFixed(1)} km` : "—"}
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}

function WorkedHoursDonut({
  worked,
  target,
}: {
  worked: number;
  target: number;
}) {
  const size = 44;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const rawRatio = target > 0 ? worked / target : 0;
  const ratio = Math.min(rawRatio, 1);
  const dashOffset = circumference - circumference * ratio;
  const label = `Worked ${worked.toFixed(1)}h of ${target}h target`;
  const display = worked >= 10 ? Math.round(worked).toString() : worked.toFixed(1);
  const tierColor =
    rawRatio >= 0.9
      ? "text-emerald-600"
      : rawRatio >= 0.5
        ? "text-amber-500"
        : "text-rose-600";

  return (
    <span
      className={cn(
        "relative ml-1 inline-flex shrink-0 items-center justify-center",
        tierColor,
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      title={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={strokeWidth}
        />
        {target > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 400ms ease-out" }}
          />
        )}
      </svg>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">
        {display}
      </span>
    </span>
  );
}

function AttendanceDateTabs({
  value,
  onChange,
  customDate,
  onCustomDateChange,
}: {
  value: DateFilter;
  onChange: (next: DateFilter) => void;
  customDate: string;
  onCustomDateChange: (next: string) => void;
}) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const tabs: { id: DateFilter; label: string }[] = [
    { id: "TODAY", label: "Today" },
    { id: "YESTERDAY", label: "Yesterday" },
    { id: "CUSTOM", label: "Choose Date" },
  ];

  function handleTabClick(next: DateFilter) {
    onChange(next);
    if (next === "CUSTOM") {
      window.setTimeout(() => {
        dateInputRef.current?.focus();
        const el = dateInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
        el?.showPicker?.();
      }, 0);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div
        role="tablist"
        aria-label="Filter attendance by date"
        className="inline-flex w-full items-center rounded-xl border border-primary/20 bg-primary/5 p-1 shadow-sm shadow-primary/10 sm:w-auto"
      >
        {tabs.map((tab) => {
          const isActive = value === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabClick(tab.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-initial",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-primary/80 hover:bg-primary/10 hover:text-primary",
              )}
            >
              {tab.id === "CUSTOM" && <Calendar className="size-3.5" />}
              {tab.label}
            </button>
          );
        })}
      </div>
      {value === "CUSTOM" && (
        <div className="relative w-full sm:w-48">
          <Calendar className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-primary" />
          <input
            ref={dateInputRef}
            type="date"
            value={customDate}
            onChange={(e) => onCustomDateChange(e.target.value)}
            max={toLocalDateKey(new Date())}
            aria-label="Pick a date"
            className={cn(
              fieldClass,
              "border-primary/30 bg-primary/5 pl-9 text-primary focus:border-primary focus:ring-primary/40",
            )}
          />
        </div>
      )}
    </div>
  );
}

function AttendanceDateFilterMenu({
  value,
  onChange,
  customDate,
  onCustomDateChange,
}: {
  value: DateFilter;
  onChange: (next: DateFilter) => void;
  customDate: string;
  onCustomDateChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeLabel =
    value === "TODAY" ? "Today" : value === "YESTERDAY" ? "Yesterday" : customDate || "Choose date";

  const options: { id: DateFilter; label: string }[] = [
    { id: "TODAY", label: "Today" },
    { id: "YESTERDAY", label: "Yesterday" },
    { id: "CUSTOM", label: "Choose Date" },
  ];

  function handleSelect(next: DateFilter) {
    onChange(next);
    if (next === "CUSTOM") {
      window.setTimeout(() => {
        dateInputRef.current?.focus();
        const el = dateInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
        el?.showPicker?.();
      }, 0);
    } else {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter by date"
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 text-sm font-semibold text-primary transition-colors",
          "hover:bg-primary/10 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25",
        )}
      >
        <Calendar className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-left">{activeLabel}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-primary transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Date filter options"
          className="absolute top-full right-0 left-0 z-30 mt-1.5 rounded-xl border border-primary/20 bg-white p-1.5 shadow-lg shadow-primary/10"
        >
          {options.map((opt) => {
            const isActive = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(opt.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "text-primary/80 hover:bg-primary/10 hover:text-primary",
                )}
              >
                {opt.id === "CUSTOM" && <Calendar className="size-4" />}
                {opt.label}
              </button>
            );
          })}
          {value === "CUSTOM" && (
            <div className="relative mt-1.5">
              <Calendar className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-primary" />
              <input
                ref={dateInputRef}
                type="date"
                value={customDate}
                onChange={(e) => onCustomDateChange(e.target.value)}
                max={toLocalDateKey(new Date())}
                aria-label="Pick a date"
                className={cn(
                  fieldClass,
                  "border-primary/30 bg-primary/5 pl-9 text-primary focus:border-primary focus:ring-primary/40",
                )}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DesktopAttendanceManagement() {
  return (
    <div className="hidden lg:block">
      <header className="mb-8">
        <p className="text-[11px] font-bold tracking-widest text-dashboard-on-surface-variant uppercase">
          Fleet
        </p>
        <h1 className="font-headline-md text-headline-md text-dashboard-on-background">
          Attendance Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse drivers by site and track daily attendance punches.
        </p>
      </header>
      <SettingsSection
        title="Attendance"
        description="Roster integrated with live attendance day/punch APIs."
        icon={Users}
      >
        <AttendancePanel />
      </SettingsSection>
    </div>
  );
}

function MobileAttendanceManagement() {
  return (
    <div className="space-y-5 lg:hidden">
      <header>
        <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
          Fleet
        </p>
        <h1 className="text-lg font-semibold text-primary">Attendance Management</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Tap a site to see and update daily attendance punches.
        </p>
      </header>
      <SettingsSection
        title="Attendance"
        description="Live roster grouped by site."
        icon={Users}
      >
        <AttendancePanel density="compact" />
      </SettingsSection>
    </div>
  );
}

export function AttendanceManagement() {
  return (
    <>
      <MobileAttendanceManagement />
      <DesktopAttendanceManagement />
    </>
  );
}
