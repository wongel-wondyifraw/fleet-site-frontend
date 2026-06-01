"use client";

import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  Loader2,
  Search,
  Trash2,
  Users,
  X,
} from "@/lib/icons";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { staggerStyle } from "@/lib/animations";
import { DESKTOP_MEDIA_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";

import { AttendanceDateFilterMenu } from "@/components/attendance/AttendanceDateFilterMenu";
import { AttendanceDateTabs } from "@/components/attendance/AttendanceDateTabs";
import { DriverAttendanceRow } from "@/components/attendance/DriverAttendanceRow";
import { RosterSummaryPill } from "@/components/attendance/RosterSummaryPill";
import { SettingsSection, fieldClass } from "@/components/settings/SettingsShared";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/Pagination";

const AttendancePunchCorrectionDialog = dynamic(
  () =>
    import("@/components/attendance/AttendancePunchCorrectionDialog").then(
      (m) => m.AttendancePunchCorrectionDialog,
    ),
  { ssr: false, loading: () => null },
);
import {
  createAttendancePunch,
  deleteAttendancePunch,
  listAttendanceRoster,
  listAttendanceRosterBulk,
  updateAttendancePunch,
} from "@/lib/api/attendance";
import { getAttendanceRules } from "@/lib/api/attendanceRules";
import { ApiError } from "@/lib/api/client";
import { listDrivers } from "@/lib/api/drivers";
import { listSites } from "@/lib/api/sites";
import { listTrips } from "@/lib/api/trips";
import { DEFAULT_TARGET_HOURS } from "@/lib/attendance-targets";
import type {
  ApiAttendanceDay,
  ApiAttendancePunch,
  ApiAttendanceRules,
  ApiDriver,
  ApiSite,
  ApiTimeSettings,
  AttendanceDayStatus,
  AttendancePunchType,
} from "@/lib/api/types";
import {
  ALL_SITES_TAB,
  ODOMETER_REQUIRED_PUNCH_TYPES,
  PUNCH_PAIRS,
  STATUS_OPTIONS,
  UNASSIGNED_TAB,
  fromLocalDateTimeInput,
  toLocalDateKey,
  toLocalDateTimeInput,
  type DateFilter,
  type StatusFilter,
} from "@/lib/attendance/attendanceHelpers";
import {
  formatDateTime,
  formatScheduleTime,
} from "@/lib/time/format";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import { useClientPagedList } from "@/lib/api/useClientPagedList";
import { cn } from "@/lib/utils";

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
  const [rules, setRules] = useState<ApiAttendanceRules | null>(null);
  const [activeTab, setActiveTab] = useState<string>(ALL_SITES_TAB);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("TODAY");
  const [customDate, setCustomDate] = useState(() => toLocalDateKey(new Date()));
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
    odometer: string;
    type: AttendancePunchType;
  } | null>(null);
  const [correctionOdometerError, setCorrectionOdometerError] = useState<
    string | null
  >(null);
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

  const { settings: timeSettings } = useTimeSettings();
  const targetHours = rules?.targetHours ?? DEFAULT_TARGET_HOURS;
  const scheduleLabel = rules
    ? `Day ${formatScheduleTime(rules.dayInTime, timeSettings)}–${formatScheduleTime(rules.dayOutTime, timeSettings)} · Lunch ${formatScheduleTime(rules.lunchOutTime, timeSettings)}–${formatScheduleTime(rules.lunchInTime, timeSettings)} · Target ${rules.targetHours}h`
    : null;

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
      const [s, d, loadedRules] = await Promise.all([
        listSites().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiSite[];
          throw err;
        }),
        listDrivers().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiDriver[];
          throw err;
        }),
        getAttendanceRules().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return null;
          throw err;
        }),
        refreshActiveTrips(),
      ]);
      setSites(s);
      setDrivers(d);
      if (loadedRules) setRules(loadedRules);
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
    // Wait until sites/drivers have loaded before evaluating empty-site
    // conditions — otherwise sortedSites is still [] and we flash a false
    // "No sites configured yet" banner above the spinner.
    if (isLoading) return;

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
        const bulk = await listAttendanceRosterBulk({
          date: targetDateKey,
          siteIds: sortedSites.map((site) => site.id),
          status: statusFilter === "ALL" ? undefined : statusFilter,
          search: searchQuery.trim() || undefined,
        }).catch((err) => {
          if (err instanceof ApiError && err.isAuth) {
            return { bySite: {} as Record<string, ApiAttendanceDay[]> };
          }
          throw err;
        });
        setRosterDays(Object.values(bulk.bySite).flat());
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
    isLoading,
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

    const needsOdometer = ODOMETER_REQUIRED_PUNCH_TYPES.has(correctionTarget.type);
    let odometerPayload: number | null | undefined = undefined;

    if (needsOdometer) {
      const normalised = correctionTarget.odometer.trim().replace(",", ".");
      const parsed = Number.parseFloat(normalised);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setCorrectionOdometerError(
          "Enter a non-negative odometer reading in kilometres.",
        );
        return;
      }
      odometerPayload = Math.round(parsed * 100) / 100;
    }

    setIsMutating(true);
    setLoadError(null);
    setCorrectionOdometerError(null);
    try {
      const updated = await updateAttendancePunch(correctionTarget.punch.id, {
        at: fromLocalDateTimeInput(correctionTarget.at),
        note: correctionTarget.note.trim() || null,
        ...(needsOdometer ? { odometer: odometerPayload } : {}),
      });
      upsertDay(updated);
      setCorrectionTarget(null);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Unable to update punch.";
      setCorrectionOdometerError(message);
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <div className="relative min-w-0 w-full sm:max-w-xs sm:flex-1 lg:max-w-sm">
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
            {scheduleLabel ? (
              <p
                className="hidden h-10 min-w-0 items-center truncate rounded-xl border border-primary/15 bg-primary/5 px-3 text-xs font-medium text-primary/80 sm:flex sm:flex-1 lg:max-w-none"
                title={`Schedule: ${scheduleLabel}`}
              >
                <span className="shrink-0 font-semibold">Schedule:</span>{" "}
                <span className="truncate">{scheduleLabel}</span>
              </p>
            ) : null}
            <div className="flex gap-2 sm:hidden">
              <div className="flex-1">
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as StatusFilter)}
                  leftIcon={Filter}
                  aria-label="Filter by attendance status"
                  options={STATUS_OPTIONS.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                  }))}
                />
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

      {!isLoading && (loadError || siteMessage) && (
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

      {scheduleLabel ? (
        <p
          className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs font-medium text-primary/80 sm:hidden"
          title={`Schedule: ${scheduleLabel}`}
        >
          <span className="font-semibold">Schedule:</span> {scheduleLabel}
        </p>
      ) : null}

      <div className="hidden flex-col gap-2 sm:flex sm:flex-row sm:items-center sm:gap-3">
        <AttendanceDateTabs
          value={dateFilter}
          onChange={setDateFilter}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
        />
        <div className="w-52 shrink-0">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            leftIcon={Filter}
            aria-label="Filter by attendance status"
            options={STATUS_OPTIONS.map((opt) => ({
              value: opt.value,
              label: opt.label,
            }))}
          />
        </div>
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
      ) : activeTab === ALL_SITES_TAB ? (
        <div className="space-y-6 fs-content-fade">
          {sortedSites.map((site) => {
            const siteRows = rosterDays.filter((d) => d.siteId === site.id);
            if (siteRows.length === 0) return null;
            return (
              <section key={site.id} className="space-y-2">
                <h3 className="text-sm font-semibold text-primary">{site.name}</h3>
                <PaginatedRosterRows
                  rows={siteRows}
                  targetDateKey={targetDateKey}
                  targetHours={targetHours}
                  density={density}
                  actionMenu={actionMenu}
                  activeTripDriverIds={activeTripDriverIds}
                  pendingOdometer={pendingOdometer}
                  onChangeOdometer={(value) =>
                    setPendingOdometer({ value, error: null })
                  }
                  onToggleMenu={(dayId, pair) => {
                    const isSame =
                      actionMenu?.dayId === dayId && actionMenu.pair === pair;
                    if (isSame) {
                      closeActionMenu();
                      return;
                    }
                    setActionMenu({ dayId, pair });
                    setPendingOdometer({ value: "", error: null });
                  }}
                  onPunch={handlePunch}
                  onPunchWithOdometer={handleSubmitPunchWithOdometer}
                  onEditPunch={(punch) => {
                    setCorrectionOdometerError(null);
                    setCorrectionTarget({
                      punch,
                      at: toLocalDateTimeInput(punch.at),
                      note: punch.note ?? "",
                      odometer: punch.odometer ?? "",
                      type: punch.type,
                    });
                  }}
                  onDeletePunch={(punch) => setDeleteTarget(punch)}
                  isMutating={isMutating}
                  timeSettings={timeSettings}
                />
              </section>
            );
          })}
        </div>
      ) : (
        <PaginatedRosterRows
          rows={rosterDays}
          targetDateKey={targetDateKey}
          targetHours={targetHours}
          density={density}
          actionMenu={actionMenu}
          activeTripDriverIds={activeTripDriverIds}
          pendingOdometer={pendingOdometer}
          onChangeOdometer={(value) =>
            setPendingOdometer({ value, error: null })
          }
          onToggleMenu={(dayId, pair) => {
            const isSame =
              actionMenu?.dayId === dayId && actionMenu.pair === pair;
            if (isSame) {
              closeActionMenu();
              return;
            }
            setActionMenu({ dayId, pair });
            setPendingOdometer({ value: "", error: null });
          }}
          onPunch={handlePunch}
          onPunchWithOdometer={handleSubmitPunchWithOdometer}
          onEditPunch={(punch) => {
            setCorrectionOdometerError(null);
            setCorrectionTarget({
              punch,
              at: toLocalDateTimeInput(punch.at),
              note: punch.note ?? "",
              odometer: punch.odometer ?? "",
              type: punch.type,
            });
          }}
          onDeletePunch={(punch) => setDeleteTarget(punch)}
          isMutating={isMutating}
          timeSettings={timeSettings}
        />
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

      {correctionTarget !== null && (
        <AttendancePunchCorrectionDialog
          open
          onOpenChange={(open) => {
            if (!open && !isMutating) {
              setCorrectionTarget(null);
              setCorrectionOdometerError(null);
            }
          }}
          correction={{
            at: correctionTarget.at,
            note: correctionTarget.note,
            odometer: correctionTarget.odometer,
            type: correctionTarget.type,
          }}
          odometerError={correctionOdometerError}
          onCorrectionChange={(updater) =>
            setCorrectionTarget((prev) => {
              if (!prev) return prev;
              const next = updater({
                at: prev.at,
                note: prev.note,
                odometer: prev.odometer,
                type: prev.type,
              });
              if (next) setCorrectionOdometerError(null);
              return next ? { ...prev, ...next } : null;
            })
          }
          isMutating={isMutating}
          onSave={() => void handleCorrectionSave()}
        />
      )}

    </div>
  );
}

function PaginatedRosterRows({
  rows,
  targetDateKey,
  targetHours,
  density,
  actionMenu,
  activeTripDriverIds,
  pendingOdometer,
  onChangeOdometer,
  onToggleMenu,
  onPunch,
  onPunchWithOdometer,
  onEditPunch,
  onDeletePunch,
  isMutating,
  timeSettings,
}: {
  rows: ApiAttendanceDay[];
  targetDateKey: string;
  targetHours: number;
  density: "comfortable" | "compact";
  actionMenu: {
    dayId: string;
    pair: (typeof PUNCH_PAIRS)[number]["key"];
  } | null;
  activeTripDriverIds: Set<string>;
  pendingOdometer: { value: string; error: string | null };
  onChangeOdometer: (value: string) => void;
  onToggleMenu: (
    dayId: string,
    pair: (typeof PUNCH_PAIRS)[number]["key"],
  ) => void;
  onPunch: (day: ApiAttendanceDay, type: AttendancePunchType) => Promise<void>;
  onPunchWithOdometer: (
    day: ApiAttendanceDay,
    type: AttendancePunchType,
  ) => Promise<void>;
  onEditPunch: (punch: ApiAttendancePunch) => void;
  onDeletePunch: (punch: ApiAttendancePunch) => void;
  isMutating: boolean;
  timeSettings: ApiTimeSettings;
}) {
  const paging = useClientPagedList(rows);

  return (
    <div className="space-y-2">
      <div className="grid gap-2">
        {paging.items.map((day, index) => (
          <div
            key={day.id}
            className="fs-row-in"
            style={staggerStyle(index)}
          >
            <DriverAttendanceRow
              day={day}
              dateKey={targetDateKey}
              targetHours={targetHours}
              density={density}
              actionMenu={actionMenu}
              isOnActiveTrip={
                day.driverId ? activeTripDriverIds.has(day.driverId) : false
              }
              pendingOdometer={pendingOdometer}
              onChangeOdometer={onChangeOdometer}
              onToggleMenu={(pair) => onToggleMenu(day.id, pair)}
              onPunch={onPunch}
              onPunchWithOdometer={onPunchWithOdometer}
              onEditPunch={onEditPunch}
              onDeletePunch={onDeletePunch}
              isMutating={isMutating}
              timeSettings={timeSettings}
            />
          </div>
        ))}
      </div>
      {rows.length > 0 && (
        <Pagination
          page={paging.page}
          pageSize={paging.pageSize}
          highestKnownPage={paging.highestKnownPage}
          totalPages={paging.totalPages}
          isLastPageReached={paging.isLastPageReached}
          isLoading={false}
          onPageChange={paging.goToPage}
          onPageSizeChange={paging.setPageSize}
        />
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
          active ? "bg-white/20 text-primary-foreground" : "bg-primary/10 text-primary",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function DesktopAttendanceManagement() {
  return (
    <div className="hidden lg:block fs-panel-in">
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
    <div className="space-y-5 lg:hidden fs-panel-in">
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
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

  if (isDesktop === null) return null;
  return isDesktop ? (
    <DesktopAttendanceManagement />
  ) : (
    <MobileAttendanceManagement />
  );
}
