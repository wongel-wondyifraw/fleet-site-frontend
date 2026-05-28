"use client";

import {
  Building2,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  Loader2,
  Plus,
  Search,
  Users,
  X,
} from "@/lib/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SettingsSection, fieldClass } from "@/components/settings/SettingsShared";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { listDrivers } from "@/lib/api/drivers";
import { listSites } from "@/lib/api/sites";
import type { ApiDriver, ApiSite } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type AttendanceStatus = "CHECKED_IN" | "CHECKED_OUT" | "ABSENT" | "ON_LEAVE";
type Shift = "DAY" | "NIGHT" | "SPLIT";

// Date filter tabs above the driver list. CUSTOM pairs with a single
// YYYY-MM-DD value the user picks in a native date input.
type DateFilter = "TODAY" | "YESTERDAY" | "CUSTOM";

const ALL_SITES_TAB = "__ALL__";
const UNASSIGNED_TAB = "__UNASSIGNED__";

// Default target working hours per day if the user hasn't set one yet.
const DEFAULT_TARGET_HOURS = 8;

// localStorage key used to persist the per-date target hours map across
// renders / reloads. Mock UI — no backend wiring yet.
const HOURS_TARGET_STORAGE_KEY = "fleetsite.attendance.targetHours.v1";

// ---------------------------------------------------------------------------
// Date helpers.
// ---------------------------------------------------------------------------
function toLocalDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Cheap deterministic hash so we can vary mock attendance per driver
// per day without flicker between renders.
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// Synthetic per-driver attendance shown next to each name. Varies by
// the active date key so flipping tabs shows different mock states.
function mockAttendance(
  driver: ApiDriver,
  dateKey: string,
): {
  status: AttendanceStatus;
  shift: Shift;
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: number;
} {
  const hash = hashString(`${driver.id}|${dateKey}`);
  const statuses: AttendanceStatus[] = [
    "CHECKED_IN",
    "CHECKED_IN",
    "CHECKED_OUT",
    "ABSENT",
    "ON_LEAVE",
  ];
  const shifts: Shift[] = ["DAY", "DAY", "NIGHT", "SPLIT"];
  const status = statuses[hash % statuses.length];
  const shift = shifts[(hash >> 3) % shifts.length];
  const minutes = (hash >> 5) % 60;
  const hour = shift === "NIGHT" ? 19 : 7 + ((hash >> 7) % 3);
  const checkIn =
    status === "ABSENT" || status === "ON_LEAVE"
      ? null
      : `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  // Worked hours: 6.5–10 for finished shifts, 0 for absent / on leave,
  // a partial 0–current for still-checked-in.
  let hoursWorked = 0;
  if (status === "CHECKED_OUT") {
    hoursWorked = 6.5 + ((hash >> 9) % 8) * 0.5;
  } else if (status === "CHECKED_IN") {
    hoursWorked = 1 + ((hash >> 11) % 12) * 0.5;
  }
  const checkOut =
    status === "CHECKED_OUT"
      ? `${String((hour + Math.floor(hoursWorked)) % 24).padStart(2, "0")}:${String((minutes + 5) % 60).padStart(2, "0")}`
      : null;
  return { status, shift, checkIn, checkOut, hoursWorked };
}

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  CHECKED_IN: "bg-blue-50 text-blue-700",
  CHECKED_OUT: "bg-emerald-50 text-emerald-700",
  ABSENT: "bg-rose-50 text-rose-700",
  ON_LEAVE: "bg-amber-50 text-amber-700",
};

function prettyStatus(status: AttendanceStatus): string {
  return status.replace("_", " ");
}

function driverName(driver: ApiDriver): string {
  const composed = `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim();
  return composed || driver.employeeId || "Unnamed driver";
}

// ---------------------------------------------------------------------------
// Hours-target persistence. Lives in localStorage as { [dateKey]: number }
// so each calendar day can have its own override and the page remembers
// across navigations. Falls back to the in-memory default on SSR.
// ---------------------------------------------------------------------------
function readStoredTargets(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(HOURS_TARGET_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function writeStoredTargets(map: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HOURS_TARGET_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* Quota / privacy mode: silently fall back to memory-only. */
  }
}

function AttendancePanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  const [sites, setSites] = useState<ApiSite[]>([]);
  const [drivers, setDrivers] = useState<ApiDriver[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(ALL_SITES_TAB);
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "ALL">(
    "ALL",
  );
  // Free-text search across the currently selected site tab. Matched
  // against the driver's first/last name and employee ID so the operator
  // can filter quickly without leaving the tab.
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("TODAY");
  const [customDate, setCustomDate] = useState<string>(() =>
    toLocalDateKey(new Date()),
  );
  const [targetHoursMap, setTargetHoursMap] = useState<Record<string, number>>(
    {},
  );

  // Hydrate from localStorage after mount so SSR output stays stable.
  useEffect(() => {
    setTargetHoursMap(readStoredTargets());
  }, []);

  const refresh = useCallback(async () => {
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
      ]);
      setSites(s);
      setDrivers(d);
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "Unable to load attendance data.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Resolved date key for the active date tab.
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

  const sortedSites = useMemo(
    () => [...sites].sort((a, b) => a.name.localeCompare(b.name)),
    [sites],
  );

  const knownSiteNames = useMemo(
    () => new Set(sites.map((s) => s.name)),
    [sites],
  );
  const hasUnassignedDrivers = useMemo(
    () => drivers.some((d) => !d.homeSite || !knownSiteNames.has(d.homeSite)),
    [drivers, knownSiteNames],
  );

  const tabCounts = useMemo(() => {
    const map = new Map<string, number>();
    map.set(ALL_SITES_TAB, drivers.length);
    let unassigned = 0;
    for (const d of drivers) {
      const site = d.homeSite ?? "";
      if (!site || !knownSiteNames.has(site)) unassigned += 1;
    }
    for (const s of sortedSites) {
      const n = drivers.filter((d) => d.homeSite === s.name).length;
      map.set(s.id, n);
    }
    map.set(UNASSIGNED_TAB, unassigned);
    return map;
  }, [drivers, sortedSites, knownSiteNames]);

  // Drivers in the currently selected site tab (pre status filter).
  const driversInTab = useMemo(() => {
    return drivers.filter((d) => {
      if (activeTab === ALL_SITES_TAB) return true;
      if (activeTab === UNASSIGNED_TAB) {
        return !d.homeSite || !knownSiteNames.has(d.homeSite);
      }
      const site = sortedSites.find((s) => s.id === activeTab);
      if (!site) return false;
      return d.homeSite === site.name;
    });
  }, [drivers, activeTab, sortedSites, knownSiteNames]);

  // Final list after applying the attendance-status filter and the
  // free-text search query. Search runs *within* the selected tab so
  // the user never accidentally jumps cohorts mid-typing.
  const visibleDrivers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return driversInTab.filter((d) => {
      if (
        statusFilter !== "ALL" &&
        mockAttendance(d, targetDateKey).status !== statusFilter
      ) {
        return false;
      }
      if (!q) return true;
      const full = `${d.firstName ?? ""} ${d.lastName ?? ""}`
        .trim()
        .toLowerCase();
      const hay = [
        full,
        d.firstName?.toLowerCase() ?? "",
        d.lastName?.toLowerCase() ?? "",
        d.employeeId?.toLowerCase() ?? "",
      ].join(" ");
      return hay.includes(q);
    });
  }, [driversInTab, statusFilter, targetDateKey, searchQuery]);

  // Aggregate hours summary for the visible cohort. Drives the
  // "Avg X / Target Y" pill near the target editor.
  const hoursSummary = useMemo(() => {
    if (driversInTab.length === 0) {
      return { avg: 0, metCount: 0, total: 0 };
    }
    let total = 0;
    let met = 0;
    for (const d of driversInTab) {
      const { hoursWorked } = mockAttendance(d, targetDateKey);
      total += hoursWorked;
      if (hoursWorked >= targetHours) met += 1;
    }
    return {
      avg: total / driversInTab.length,
      metCount: met,
      total: driversInTab.length,
    };
  }, [driversInTab, targetDateKey, targetHours]);

  const activeSiteLabel =
    activeTab === ALL_SITES_TAB
      ? "All sites"
      : activeTab === UNASSIGNED_TAB
        ? "Unassigned"
        : (sortedSites.find((s) => s.id === activeTab)?.name ?? "Site");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-primary">
              {visibleDrivers.length}
            </span>{" "}
            of {drivers.length}{" "}
            {drivers.length === 1 ? "driver" : "drivers"} shown for{" "}
            <span className="font-semibold text-primary">{activeSiteLabel}</span>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {/* Free-text search. Filters drivers within the currently
                selected site tab by name / employee ID. */}
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
            {/* Mobile-only status + date filters. The desktop status
                select has moved down to the site-tabs row so this
                filter wrapper is hidden on `sm+`. */}
            <div className="flex gap-2 sm:hidden">
              <div className="relative flex-1">
                <Filter className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as AttendanceStatus | "ALL")
                  }
                  className={`${fieldClass} pl-9`}
                  aria-label="Filter by attendance status"
                >
                  <option value="ALL">All statuses</option>
                  <option value="CHECKED_IN">Checked In</option>
                  <option value="CHECKED_OUT">Checked Out</option>
                  <option value="ABSENT">Absent</option>
                  <option value="ON_LEAVE">On Leave</option>
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
        {/* Mobile: target editor stacks above the action button. Desktop:
            both sit on the right of the header row. */}
        <div className="flex items-center justify-between gap-2 sm:contents">
          <div className="min-w-0 flex-1 sm:hidden">
            <TargetHoursEditor
              value={targetHours}
              isOverride={isTargetOverride}
              onSave={handleSaveTargetHours}
              onReset={handleResetTargetHours}
            />
          </div>
          <Button className="h-10 shrink-0 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint sm:self-end">
            <Plus className="size-4" />
            Add Attendance
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2.5 text-sm text-rose-800">
          {loadError}
        </div>
      )}

      {/* Site tabs. Styled as a segmented control matching the date
          tabs below. Wrapped in an overflow-x scroll so a long list of
          sites can slide horizontally instead of wrapping. */}
      <div className="-mx-1 overflow-x-auto pb-1">
        <div
          role="tablist"
          aria-label="Filter attendance by site"
          className="inline-flex min-w-max items-center gap-1 rounded-xl border border-primary/20 bg-primary/5 p-1 shadow-sm shadow-primary/10 mx-1"
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

      {/* Desktop: full date tabs + status filter + target editor row.
          Hidden on mobile because the collapsed pieces live in the
          filter row above. */}
      <div className="hidden flex-col gap-2 sm:flex sm:flex-row sm:items-center sm:gap-3">
        <AttendanceDateTabs
          value={dateFilter}
          onChange={setDateFilter}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
        />
        {/* Desktop status filter — sits between the date tabs and the
            target hours editor so all per-cohort filters cluster on
            the same line. Mobile variant lives in the filter row
            above. */}
        <div className="relative w-52 shrink-0">
          <Filter className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as AttendanceStatus | "ALL")
            }
            className={`${fieldClass} pl-9`}
            aria-label="Filter by attendance status"
          >
            <option value="ALL">All statuses</option>
            <option value="CHECKED_IN">Checked In</option>
            <option value="CHECKED_OUT">Checked Out</option>
            <option value="ABSENT">Absent</option>
            <option value="ON_LEAVE">On Leave</option>
          </select>
        </div>
        <TargetHoursEditor
          value={targetHours}
          isOverride={isTargetOverride}
          onSave={handleSaveTargetHours}
          onReset={handleResetTargetHours}
        />
        <HoursSummaryPill
          avg={hoursSummary.avg}
          met={hoursSummary.metCount}
          total={hoursSummary.total}
          target={targetHours}
        />
      </div>

      {isLoading && drivers.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : visibleDrivers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
          <Users className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-primary">
            {searchQuery.trim()
              ? `No drivers in ${activeSiteLabel} match "${searchQuery.trim()}".`
              : `No drivers in ${activeSiteLabel}.`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {searchQuery.trim()
              ? "Try a different name or clear the search."
              : "Assign drivers to this site to start tracking their attendance."}
          </p>
          {searchQuery.trim() && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="mt-3 inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-primary transition-colors hover:bg-slate-50"
            >
              <X className="size-3.5" />
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-2">
          {visibleDrivers.map((driver) => (
            <DriverAttendanceRow
              key={driver.id}
              driver={driver}
              dateKey={targetDateKey}
              targetHours={targetHours}
              density={density}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Target hours editor — modeled after the trips `DailyTargetEditor`. Lets
// the user pick a per-day expected working-hours target. Persists via
// localStorage in mock mode.
// ---------------------------------------------------------------------------
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
  // Track the committed value separately so we know whether the user's
  // current typing actually differs from what's saved.
  const [draft, setDraft] = useState<string>(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit() {
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setDraft(String(value));
      return;
    }
    if (parsed === value) return;
    onSave(parsed);
  }

  function step(delta: number) {
    const base = Number.parseFloat(draft);
    const current = Number.isFinite(base) ? base : value;
    const next = Math.max(0, Math.min(24, current + delta));
    setDraft(String(next));
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
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            }
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

// Small "Avg X / Target Y" chip surfaced on desktop. Tells the operator at
// a glance how the cohort is tracking against the target hours.
function HoursSummaryPill({
  avg,
  met,
  total,
  target,
}: {
  avg: number;
  met: number;
  total: number;
  target: number;
}) {
  if (total === 0) return null;
  const meeting = total > 0 ? Math.round((met / total) * 100) : 0;
  return (
    <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
      <span>
        Avg{" "}
        <span className="text-primary tabular-nums">
          {avg.toFixed(1)}h
        </span>
      </span>
      <span aria-hidden className="text-slate-300">
        |
      </span>
      <span>
        <span className="text-primary tabular-nums">{met}</span> / {total} met
        target ({meeting}%)
      </span>
      <span aria-hidden className="text-slate-300">
        |
      </span>
      <span>
        Target{" "}
        <span className="text-primary tabular-nums">{target}h</span>
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Date tabs — desktop. Today / Yesterday / Choose Date.
// ---------------------------------------------------------------------------
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
        const el = dateInputRef.current as
          | (HTMLInputElement & { showPicker?: () => void })
          | null;
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

// ---------------------------------------------------------------------------
// Date filter — mobile collapsed variant. Sits next to the status filter
// on small screens, opening a dropdown with the three options.
// ---------------------------------------------------------------------------
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
    value === "TODAY"
      ? "Today"
      : value === "YESTERDAY"
        ? "Yesterday"
        : customDate || "Choose date";

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
        const el = dateInputRef.current as
          | (HTMLInputElement & { showPicker?: () => void })
          | null;
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
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-primary transition-transform",
            open && "rotate-180",
          )}
        />
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
          active
            ? "bg-white/20 text-primary-foreground"
            : "bg-primary/10 text-primary",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function DriverAttendanceRow({
  driver,
  dateKey,
  targetHours,
  density,
}: {
  driver: ApiDriver;
  dateKey: string;
  targetHours: number;
  density: "comfortable" | "compact";
}) {
  const att = mockAttendance(driver, dateKey);
  const metTarget = att.hoursWorked >= targetHours;
  return (
    <article
      className={cn(
        "rounded-xl border border-slate-200/80 bg-white shadow-sm",
        density === "compact" ? "p-3" : "p-4",
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
            {driver.firstName?.[0] ?? "?"}
            {driver.lastName?.[0] ?? ""}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary">
              {driverName(driver)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {driver.employeeId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {att.status !== "ABSENT" && att.status !== "ON_LEAVE" && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                metTarget
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-muted-foreground",
              )}
              title={`Worked ${att.hoursWorked.toFixed(1)}h of ${targetHours}h target`}
            >
              {att.hoursWorked.toFixed(1)}h / {targetHours}h
            </span>
          )}
          <span
            className={cn(
              "inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
              STATUS_STYLES[att.status],
            )}
          >
            {prettyStatus(att.status)}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <p className="inline-flex items-center gap-1.5">
          <Building2 className="size-3.5" />
          {driver.homeSite ?? "No site"}
        </p>
        <p className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5" />
          {att.shift} shift
        </p>
        <p className="inline-flex items-center gap-1.5">
          <CheckCircle className="size-3.5" />
          {att.checkIn ? `In: ${att.checkIn}` : "Not checked in"}
          {att.checkOut ? ` · Out: ${att.checkOut}` : ""}
        </p>
      </div>
    </article>
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
          Browse drivers by site and track daily check-ins and check-outs.
        </p>
      </header>

      <SettingsSection
        title="Attendance"
        description="Mock UI grouped by site, populated from real drivers."
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
          Tap a site to see its drivers and shift status.
        </p>
      </header>

      <SettingsSection
        title="Attendance"
        description="Mock attendance grouped by site."
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
