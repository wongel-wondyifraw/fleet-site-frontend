"use client";

import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  Loader2,
  Pencil,
  Search,
  Trash2,
  Users,
  X,
} from "@/lib/icons";
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
const DEFAULT_TARGET_HOURS = 8;
const HOURS_TARGET_STORAGE_KEY = "fleetsite.attendance.targetHours.v1";

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

const PUNCH_PAIRS: {
  key: "day" | "lunch" | "maint";
  label: string;
  outType: AttendancePunchType;
  inType: AttendancePunchType;
}[] = [
  { key: "day", label: "Day", outType: "DAY_IN", inType: "DAY_OUT" },
  { key: "lunch", label: "Lunch", outType: "LUNCH_OUT", inType: "LUNCH_IN" },
  { key: "maint", label: "Maintenance", outType: "MAINT_OUT", inType: "MAINT_IN" },
];

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
  } catch {}
}

function AttendancePanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  const [sites, setSites] = useState<ApiSite[]>([]);
  const [drivers, setDrivers] = useState<ApiDriver[]>([]);
  const [rosterDays, setRosterDays] = useState<ApiAttendanceDay[]>([]);
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

  const tabCounts = useMemo(() => {
    const map = new Map<string, number>();
    map.set(ALL_SITES_TAB, drivers.length);
    let unassigned = 0;
    for (const d of drivers) {
      const site = d.homeSite ?? "";
      if (!site || !knownSiteNames.has(site)) unassigned += 1;
    }
    for (const s of sortedSites) {
      map.set(s.id, drivers.filter((d) => d.homeSite === s.name).length);
    }
    map.set(UNASSIGNED_TAB, unassigned);
    return map;
  }, [drivers, sortedSites, knownSiteNames]);

  const resolvedSiteId = useMemo(() => {
    if (activeTab === ALL_SITES_TAB) return sortedSites[0]?.id ?? null;
    if (activeTab === UNASSIGNED_TAB) return null;
    return sortedSites.some((s) => s.id === activeTab) ? activeTab : null;
  }, [activeTab, sortedSites]);

  const activeSiteLabel =
    activeTab === ALL_SITES_TAB
      ? "All sites"
      : activeTab === UNASSIGNED_TAB
        ? "Unassigned"
        : (sortedSites.find((s) => s.id === activeTab)?.name ?? "Site");

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
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refreshBase();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refreshBase]);

  const refreshRoster = useCallback(async () => {
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
  }, [resolvedSiteId, activeTab, sortedSites.length, targetDateKey, statusFilter, searchQuery]);

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
    setIsMutating(true);
    setLoadError(null);
    try {
      const updated = await createAttendancePunch(day.id, { type });
      upsertDay(updated);
      setActionMenu(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Unable to create punch.");
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
              onToggleMenu={(pair) =>
                setActionMenu((prev) =>
                  prev?.dayId === day.id && prev.pair === pair
                    ? null
                    : { dayId: day.id, pair },
                )
              }
              onPunch={handlePunch}
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
  onToggleMenu,
  onPunch,
  onEditPunch,
  onDeletePunch,
  isMutating,
}: {
  day: ApiAttendanceDay;
  dateKey: string;
  targetHours: number;
  density: "comfortable" | "compact";
  actionMenu: { dayId: string; pair: "day" | "lunch" | "maint" } | null;
  onToggleMenu: (pair: "day" | "lunch" | "maint") => void;
  onPunch: (day: ApiAttendanceDay, type: AttendancePunchType) => Promise<void>;
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
        "rounded-xl border border-slate-200/80 bg-white shadow-sm",
        density === "compact" ? "p-3" : "p-4",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
            {day.driver?.firstName?.[0] ?? "?"}
            {day.driver?.lastName?.[0] ?? ""}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-primary">{driverName(day)}</p>
              <span
                className={cn(
                  "inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                  STATUS_STYLES[day.status],
                )}
              >
                {prettyStatus(day.status)}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {day.driver?.employeeId ?? "No employee ID"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end lg:shrink-0">
          {PUNCH_PAIRS.map((pair) => {
            const open = actionMenu?.dayId === day.id && actionMenu.pair === pair.key;
            const state = pairState(pair.key);
            const next = nextAction(pair.key);
            const pairPunches = punches.filter(
              (p) => p.type === pair.outType || p.type === pair.inType,
            );
            return (
              <div key={pair.key} className="relative">
                  <button
                    type="button"
                    onClick={() => onToggleMenu(pair.key)}
                    className={cn(
                      "inline-flex w-32 items-center justify-between gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold",
                      state === "OUT"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : state === "IN"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-700",
                    )}
                  >
                    <span className="truncate">{pair.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-bold">
                        {state}
                      </span>
                      <ChevronDown className={cn("size-3", open && "rotate-180")} />
                    </span>
                  </button>
                  {open && (
                    <div className="absolute top-full left-0 z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                      {next ? (
                        <Button
                          type="button"
                          disabled={isMutating}
                          onClick={() => onPunch(day, next.type)}
                          className="h-8 w-full justify-start rounded-lg px-2 text-xs"
                        >
                          {next.label}
                        </Button>
                      ) : (
                        <p className="px-2 py-1 text-[11px] text-muted-foreground">
                          No action available
                        </p>
                      )}
                      <div className="mt-1 space-y-1 border-t border-slate-100 pt-1">
                        {pairPunches.length === 0 ? (
                          <p className="px-2 py-1 text-[11px] text-muted-foreground">No punches yet</p>
                        ) : (
                          pairPunches.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[11px] text-slate-700"
                            >
                              <span className="truncate">
                                {p.type.replace("_", " ")} · {formatPunchTime(p.at)}
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
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          <WorkedHoursDonut worked={worked} target={targetHours} />
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
