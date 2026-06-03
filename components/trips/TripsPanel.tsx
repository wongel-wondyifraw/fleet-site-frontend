"use client";

import {
  ArrowRight,
  Ban,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Filter,
  Info,
  Loader2,
  MapPin,
  Navigation,
  Pencil,
  Play,
  Plus,
  Route,
  Search,
  Timer,
  Trash2,
  Truck,
  UserRound,
  X,
} from "@/lib/icons";
import dynamic from "next/dynamic";
import Link from "next/link";
import { DailyTargetEditor } from "@/components/trips/DailyTargetEditor";
import { TripDateFilterMenu } from "@/components/trips/TripDateFilterMenu";
import { TripDateTabs } from "@/components/trips/TripDateTabs";
import { TripStatusFilterMenu } from "@/components/trips/TripStatusFilterMenu";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/Pagination";
import { PanelError } from "@/components/vehicles/VehicleForm";
import { fieldClass } from "@/components/settings/SettingsShared";
import { ApiError } from "@/lib/api/client";
import { listDriversLookup } from "@/lib/api/drivers";
import { useCursorPagedList } from "@/lib/api/useCursorPagedList";
import {
  createTrip,
  deleteTrip,
  listTrips,
  listTripsPage,
  setTripStatus,
  updateTrip,
  type CreateTripRequest,
  type TripsListMeta,
} from "@/lib/api/trips";
import { listCustomTripRoutes } from "@/lib/api/customTripRoutes";
import { listMySites } from "@/lib/api/sites";
import {
  clearTripTargetOverride,
  setTripTargetOverride,
} from "@/lib/api/tripTargets";
import { Can, useCan } from "@/components/auth/Can";
import { SiteScopeEmptyState } from "@/components/shared/SiteScopeEmptyState";
import { useScopedSiteIds } from "@/lib/auth/useScopedSiteIds";
import { formatDateTime } from "@/lib/time/format";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import { useToast } from "@/lib/toast/ToastContext";
import {
  TRIP_STATUSES,
  prettyEnum,
  type ApiCustomTripRoute,
  type ApiDriver,
  type ApiSite,
  type ApiTrip,
  type ApiTripTargetEffective,
  type ApiVehicle,
  type TripDriverSummary,
  type TripStatus,
  type TripVehicleSummary,
} from "@/lib/api/types";
import { listVehiclesLookup } from "@/lib/api/vehicles";
import {
  customRouteDistanceKm,
  findMatchingCustomRoute,
  formatDistance,
  formatDuration,
  formatLocationLine,
  getTripDistanceKm,
  getTripEffectiveDate,
  haversineKm,
  resolveCheckinDistanceKm,
  toLocalDateKey,
} from "@/lib/trips/tripFormatters";
import {
  TRIP_STATUS_PILL,
  type DateFilter,
  type TripGroup,
  type TripsPanelMode as Mode,
} from "@/lib/trips/tripFormState";
import { staggerStyle } from "@/lib/animations";
import { cn } from "@/lib/utils";

const TripForm = dynamic(
  () => import("@/components/trips/TripForm").then((m) => m.TripForm),
  { ssr: false, loading: () => null },
);

export function TripsPanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  const [vehicles, setVehicles] = useState<ApiVehicle[]>([]);
  const [drivers, setDrivers] = useState<ApiDriver[]>([]);
  const [sites, setSites] = useState<ApiSite[]>([]);
  // Admin-defined start/end presets surfaced on the trip-creation form
  // as "Custom" pickers. Tolerated as empty on auth failures so the
  // panel keeps working for non-admin viewers.
  const [customRoutes, setCustomRoutes] = useState<ApiCustomTripRoute[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [statusFilter, setStatusFilter] = useState<TripStatus | "ALL">("ALL");
  const [vehicleFilter, setVehicleFilter] = useState<string>("ALL");
  const [siteFilter, setSiteFilter] = useState<string>("ALL");
  // Free-text search across the active date's trips. Matched against the
  // driver, vehicle, and start/end location fields so the operator can
  // narrow the list without flipping filter dropdowns.
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("TODAY");
  // Date the user picked in the "Choose Date" tab. Stored as a
  // YYYY-MM-DD string so it lines up with both the native date input
  // and `toLocalDateKey` for comparison.
  const [customDate, setCustomDate] = useState<string>(() =>
    toLocalDateKey(new Date()),
  );
  const [auxLoading, setAuxLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ApiTrip | null>(null);
  // Trip queued for cancel confirmation. Kept separate from delete because
  // cancel is reversible-ish (the row keeps a CANCELLED record) so we don't
  // want to share the destructive copy.
  const [pendingCancel, setPendingCancel] = useState<ApiTrip | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  // Effective "expected trips per day" target for the active date.
  // Backed by the /trip-targets API: returns the override for the date
  // if one exists, otherwise the global default (seeded to 25 on first
  // backend access). Donut charts and the editor input below the date
  // tabs both read from this.
  const [targetState, setTargetState] = useState<ApiTripTargetEffective | null>(
    null,
  );
  const [isSavingTarget, setIsSavingTarget] = useState(false);
  const [inProgressDriverIds, setInProgressDriverIds] = useState<Set<string>>(
    () => new Set(),
  );
  const { showToast } = useToast();
  const { settings: timeSettings } = useTimeSettings();
  const { hasAssignments } = useScopedSiteIds();

  const vehicleById = useMemo(() => {
    const map = new Map<string, ApiVehicle>();
    for (const v of vehicles) map.set(v.id, v);
    return map;
  }, [vehicles]);

  const driverById = useMemo(() => {
    const map = new Map<string, ApiDriver>();
    for (const d of drivers) map.set(d.id, d);
    return map;
  }, [drivers]);

  // Resolve the date the active date tab is asking us to match. Computed
  // up front so the filter loop doesn't recreate `Date` objects per row.
  const targetDateKey = useMemo(() => {
    if (dateFilter === "TODAY") return toLocalDateKey(new Date());
    if (dateFilter === "YESTERDAY") {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return toLocalDateKey(d);
    }
    return customDate;
  }, [dateFilter, customDate]);

  // Drivers currently on an IN_PROGRESS trip. We block creating new
  // trips for these drivers (and surface a warning in the trip form) so
  // the operator can't pile on additional work while someone is still
  // on the road. Mirrors the backend rule in TripService.create.
  const tripList = useCursorPagedList<ApiTrip, TripsListMeta>({
    fetchPage: (cursor, limit) =>
      listTripsPage({
        date: targetDateKey,
        timezone: timeSettings.timezone,
        includeTarget: true,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        vehicleId: vehicleFilter === "ALL" ? undefined : vehicleFilter,
        siteId: siteFilter === "ALL" ? undefined : siteFilter,
        cursor,
        limit,
      }),
    deps: [
      targetDateKey,
      timeSettings.timezone,
      statusFilter,
      vehicleFilter,
      siteFilter,
    ],
  });

  useEffect(() => {
    if (tripList.meta?.targetForDate) {
      setTargetState(tripList.meta.targetForDate);
    }
  }, [tripList.meta]);

  const busyDriverIds = useMemo(() => {
    const set = new Set(inProgressDriverIds);
    for (const t of tripList.items) {
      if (t.status === "IN_PROGRESS" && t.driverId) set.add(t.driverId);
    }
    return set;
  }, [tripList.items, inProgressDriverIds]);

  const refreshAux = useCallback(async () => {
    setAuxLoading(true);
    setLoadError(null);
    try {
      const [v, d, s, r, inProgressTrips] = await Promise.all([
        listVehiclesLookup(),
        listDriversLookup().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiDriver[];
          throw err;
        }),
        listMySites().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiSite[];
          throw err;
        }),
        listCustomTripRoutes().catch((err) => {
          if (err instanceof ApiError && err.isAuth)
            return [] as ApiCustomTripRoute[];
          throw err;
        }),
        listTrips({ status: "IN_PROGRESS" }).catch(() => [] as ApiTrip[]),
      ]);
      setVehicles(v);
      setDrivers(d);
      setSites(s);
      setCustomRoutes(r);
      const busy = new Set<string>();
      for (const trip of inProgressTrips) {
        if (trip.driverId) busy.add(trip.driverId);
      }
      setInProgressDriverIds(busy);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load trips.",
      );
    } finally {
      setAuxLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAux();
  }, [refreshAux]);

  useEffect(() => {
    if (tripList.error) {
      setLoadError(tripList.error.message);
    }
  }, [tripList.error]);

  const refresh = useCallback(async () => {
    await Promise.all([tripList.reload(), refreshAux()]);
  }, [tripList, refreshAux]);

  const isLoading = auxLoading || tripList.isLoading;

  const filteredTrips = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tripList.items.filter((t) => {
      if (!q) return true;
      // Resolve nested summaries first, then fall back to the locally
      // looked-up records so the search works whether the API returned
      // joined data or not.
      const vehicle = t.vehicle ?? vehicleById.get(t.vehicleId) ?? null;
      const driver = t.driverId
        ? (t.driver ?? driverById.get(t.driverId) ?? null)
        : null;
      const hay = [
        driver
          ? `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim()
          : "",
        driver?.employeeId ?? "",
        vehicle?.assetNumber ?? "",
        vehicle?.plateNumber ?? "",
        t.startAddress ?? "",
        t.startCity ?? "",
        t.endAddress ?? "",
        t.endCity ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [tripList.items, searchQuery, vehicleById, driverById]);

  const groupedTrips = useMemo<TripGroup[]>(() => {
    const map = new Map<string, TripGroup>();
    for (const trip of filteredTrips) {
      const key = trip.driverId ?? `__solo_${trip.id}`;
      const existing = map.get(key);
      if (existing) existing.trips.push(trip);
      else map.set(key, { key, driverId: trip.driverId ?? null, trips: [trip] });
    }
    return Array.from(map.values());
  }, [filteredTrips]);

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSaveTarget(nextCount: number) {
    if (!Number.isFinite(nextCount) || nextCount < 0) return;
    setIsSavingTarget(true);
    try {
      const result = await setTripTargetOverride(
        targetDateKey,
        Math.floor(nextCount),
      );
      setTargetState(result);
    } catch (err) {
      showToast({
        variant: "error",
        message:
          err instanceof ApiError ? err.message : "Unable to update target.",
      });
    } finally {
      setIsSavingTarget(false);
    }
  }

  async function handleResetTarget() {
    if (!targetState?.isOverride) return;
    setIsSavingTarget(true);
    try {
      const result = await clearTripTargetOverride(targetDateKey);
      setTargetState(result);
    } catch (err) {
      showToast({
        variant: "error",
        message:
          err instanceof ApiError ? err.message : "Unable to reset target.",
      });
    } finally {
      setIsSavingTarget(false);
    }
  }

  async function handleCreate(payload: CreateTripRequest): Promise<void> {
    try {
      await createTrip(payload);
      setMode({ kind: "list" });
      await refresh();
      showToast({ variant: "success", message: "Trip created." });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Unable to create trip.";
      showToast({ variant: "error", message });
      // Re-throw so the form can also surface the inline message it
      // already renders, keeping desktop / fallback paths working.
      throw err;
    }
  }

  async function handleUpdate(
    id: string,
    payload: CreateTripRequest,
  ): Promise<void> {
    try {
      await updateTrip(id, payload);
      setMode({ kind: "list" });
      await refresh();
      showToast({ variant: "success", message: "Trip updated." });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Unable to update trip.";
      showToast({ variant: "error", message });
      throw err;
    }
  }

  async function handleConfirmedDelete(target: ApiTrip): Promise<void> {
    try {
      await deleteTrip(target.id);
      await refresh();
      showToast({ variant: "success", message: "Trip deleted." });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Unable to delete trip.";
      setLoadError(message);
      showToast({ variant: "error", message });
    }
  }

  // Reschedules a PLANNED trip that drifted into a past date back to
  // today by stamping `scheduledAt` with the current time. The trip's
  // effective date (used by the Today / Yesterday tabs) is derived
  // from `scheduledAt` for planned rows, so this is sufficient to
  // move it into the Today bucket without touching anything else.
  async function handleMoveToToday(target: ApiTrip): Promise<void> {
    try {
      await updateTrip(target.id, { scheduledAt: new Date().toISOString() });
      await refresh();
      showToast({ variant: "success", message: "Trip moved to today." });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Unable to move trip.";
      showToast({ variant: "error", message });
    }
  }

  // Drives the Trip Checkout / Check-in / Cancel buttons. Refresh after
  // each transition so the row picks up the new status, timestamps, and
  // the next set of available actions in one round-trip.
  async function handleStatusChange(
    target: ApiTrip,
    next: TripStatus,
    options: { distanceKm?: number | null } = {},
  ): Promise<void> {
    try {
      await setTripStatus(target.id, next, options);
      await refresh();
      showToast({
        variant: "success",
        message:
          next === "IN_PROGRESS"
            ? "Trip checked out."
            : next === "COMPLETED"
              ? "Trip checked in."
              : next === "CANCELLED"
                ? "Trip cancelled."
                : "Trip updated.",
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Unable to update trip status.";
      setLoadError(message);
      showToast({ variant: "error", message });
      // Surface the failure back to the row so its loading state resolves
      // without it assuming the action succeeded.
      throw err;
    }
  }

  if (mode.kind === "create" || mode.kind === "edit") {
    const editing = mode.kind === "edit" ? mode.trip : null;
    return (
      <TripForm
        initial={editing}
        vehicles={vehicles}
        drivers={drivers}
        sites={sites}
        customRoutes={customRoutes}
        busyDriverIds={busyDriverIds}
        onCancel={() => setMode({ kind: "list" })}
        onSubmit={async (payload) => {
          if (editing) {
            await handleUpdate(editing.id, payload);
          } else {
            await handleCreate(payload);
          }
        }}
      />
    );
  }

  if (!hasAssignments) {
    return <SiteScopeEmptyState />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-primary">
              {filteredTrips.length}
            </span>{" "}
            on this page
            {tripList.isLastPageReached && tripList.totalPages !== undefined
              ? ` · ${tripList.totalPages} page${tripList.totalPages === 1 ? "" : "s"} total`
              : null}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {/* Search + status row.
                - Mobile: the wrapper is a flex row so the search input
                  and the status select each take half the width and
                  sit inline.
                - From `sm` upwards we use `contents` so the wrapper
                  disappears from layout and the search reclaims its
                  desktop-wide treatment while the status drops out
                  (the desktop variant lives in the controls row
                  below). */}
            <div className="flex gap-2 sm:contents">
              {/* Free-text search. Filters trips by driver, vehicle, or
                  start/end location within the active date. Grows to
                  roughly the same right edge as the controls row below
                  (date tabs + status + vehicle + target editor), so the
                  two rows feel column-aligned. Capped via max-w so it
                  doesn't push into the Create Trip button on the
                  right. */}
              <div className="relative flex-1 sm:max-w-4xl">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search driver, vehicle, location"
                  aria-label="Search trips"
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
              {/* Mobile status filter â€” a compact 40x40 icon button that
                  opens a dropdown with the status options. Replaces
                  the half-width native select so the search input can
                  reclaim the bulk of the row. Desktop equivalent lives
                  in the date-tabs row below alongside the target
                  editor. */}
              <div className="sm:hidden">
                <TripStatusFilterMenu
                  value={statusFilter}
                  onChange={setStatusFilter}
                />
              </div>
            </div>
            {/* Mobile vehicle + date-filter row. The whole wrapper is
                hidden on `sm+` because the desktop equivalents live
                in the second row beside the date tabs. */}
            <div className="flex gap-2 sm:hidden">
              <div className="flex-1">
                <Select
                  value={vehicleFilter}
                  onValueChange={setVehicleFilter}
                  leftIcon={Truck}
                  aria-label="Filter by vehicle"
                  options={[
                    { value: "ALL", label: "All vehicles" },
                    ...vehicles.map((v) => ({
                      value: v.id,
                      label: v.assetNumber ?? v.plateNumber,
                      searchText: `${v.assetNumber ?? ""} ${v.plateNumber}`,
                    })),
                  ]}
                />
              </div>
              <div className="relative flex-1">
                <TripDateFilterMenu
                  value={dateFilter}
                  onChange={setDateFilter}
                  customDate={customDate}
                  onCustomDateChange={setCustomDate}
                />
              </div>
            </div>
          </div>
        </div>
        {/* Mobile: wrap the daily-target editor inline to the LEFT of
            the Create Trip button so the action row makes use of the
            full width. `sm:contents` removes the wrapper at the sm
            breakpoint and up, so the button hops back to being a
            direct child of the header row with its desktop alignment
            intact. */}
        <div className="flex items-center justify-between gap-2 sm:contents">
          <Can permission="trip-targets.update">
            <div className="min-w-0 flex-1 sm:hidden">
              <DailyTargetEditor
                target={targetState}
                isSaving={isSavingTarget}
                onSave={handleSaveTarget}
                onReset={handleResetTarget}
              />
            </div>
          </Can>
          <Can permission="trips.create">
            <Button
              onClick={() => setMode({ kind: "create" })}
              disabled={vehicles.length === 0}
              className="h-10 shrink-0 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint sm:self-auto"
            >
              <Plus className="size-4" />
              Create Trip
            </Button>
          </Can>
        </div>
      </div>

      {/* Date tabs + status / vehicle / daily-target controls (desktop).
          The first row up top now owns the search input full-width and
          all the small controls live here together â€” date tabs lead,
          then the dropdowns, then the target editor on the right.
          Hidden below `sm` â€” mobile keeps the dropdowns and the
          collapsed date button up in the filter row above. */}
      <div className="hidden flex-wrap items-center gap-3 sm:flex">
        <TripDateTabs
          value={dateFilter}
          onChange={setDateFilter}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
        />
        <div className="w-44">
          <Select
            value={statusFilter}
            onValueChange={(v) =>
              setStatusFilter(v as TripStatus | "ALL")
            }
            leftIcon={Filter}
            aria-label="Filter by status"
            options={[
              { value: "ALL", label: "All statuses" },
              ...TRIP_STATUSES.map((s) => ({
                value: s,
                label: prettyEnum(s),
              })),
            ]}
          />
        </div>
        <div className="w-56">
          <Select
            value={vehicleFilter}
            onValueChange={setVehicleFilter}
            leftIcon={Truck}
            aria-label="Filter by vehicle"
            options={[
              { value: "ALL", label: "All vehicles" },
              ...vehicles.map((v) => ({
                value: v.id,
                label: v.assetNumber ?? v.plateNumber,
                searchText: `${v.assetNumber ?? ""} ${v.plateNumber}`,
              })),
            ]}
          />
        </div>
        <div className="w-56">
          <Select
            value={siteFilter}
            onValueChange={setSiteFilter}
            leftIcon={Building2}
            aria-label="Filter by site"
            options={[
              { value: "ALL", label: "All my sites" },
              ...sites.map((s) => ({
                value: s.id,
                label: s.name,
              })),
            ]}
          />
        </div>
        <Can permission="trip-targets.update">
          <DailyTargetEditor
            target={targetState}
            isSaving={isSavingTarget}
            onSave={handleSaveTarget}
            onReset={handleResetTarget}
          />
        </Can>
      </div>

      {vehicles.length === 0 && !isLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-800">
          Register at least one vehicle before creating trips.
        </div>
      )}

      {loadError && <PanelError message={loadError} />}

      {isLoading && tripList.items.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : filteredTrips.length === 0 ? (
        tripList.items.length === 0 && !searchQuery.trim() ? (
          <EmptyState hasVehicles={vehicles.length > 0} />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
            <Route className="mx-auto mb-2 size-6 text-muted-foreground" />
            <p className="text-sm font-medium text-primary">
              {searchQuery.trim()
                ? `No trips match "${searchQuery.trim()}".`
                : "No trips match your filters."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Showing{" "}
              <span className="font-semibold text-primary">
                {dateFilter === "TODAY"
                  ? "today"
                  : dateFilter === "YESTERDAY"
                    ? "yesterday"
                    : customDate || "the selected date"}
              </span>
              .
            </p>
            {(statusFilter !== "ALL" ||
              vehicleFilter !== "ALL" ||
              siteFilter !== "ALL" ||
              dateFilter !== "TODAY" ||
              searchQuery.trim() !== "") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter("ALL");
                  setVehicleFilter("ALL");
                  setSiteFilter("ALL");
                  setDateFilter("TODAY");
                  setSearchQuery("");
                }}
                className="mt-3 h-8 gap-1 rounded-lg border-slate-200 bg-white px-3 text-xs"
              >
                Clear filters
              </Button>
            )}
          </div>
        )
      ) : (
        <div className="space-y-2 fs-content-fade">
          {groupedTrips.map((group, index) => {
            if (group.trips.length === 1) {
              const trip = group.trips[0];
              return (
                <div
                  key={trip.id}
                  className="fs-row-in"
                  style={staggerStyle(index)}
                >
                <TripRow
                  trip={trip}
                  vehicle={trip.vehicle ?? vehicleById.get(trip.vehicleId) ?? null}
                  driver={
                    trip.driverId
                      ? (trip.driver ?? driverById.get(trip.driverId) ?? null)
                      : null
                  }
                  density={density}
                  customRoutes={customRoutes}
                  onEdit={() => setMode({ kind: "edit", trip })}
                  onDelete={() => setPendingDelete(trip)}
                  onRequestCancel={() => setPendingCancel(trip)}
                  onMoveToToday={() => handleMoveToToday(trip)}
                  onStatusChange={(next, options) =>
                    handleStatusChange(trip, next, options)
                  }
                />
                </div>
              );
            }

            return (
              <div
                key={group.key}
                className="fs-row-in"
                style={staggerStyle(index)}
              >
              <TripGroupCard
                groupKey={group.key}
                trips={group.trips}
                driver={
                  group.driverId
                    ? (driverById.get(group.driverId) ?? group.trips[0]?.driver ?? null)
                    : null
                }
                density={density}
                expanded={expandedGroups.has(group.key)}
                targetCount={targetState?.count ?? null}
                customRoutes={customRoutes}
                onToggle={() => toggleGroup(group.key)}
                resolveVehicle={(trip) =>
                  trip.vehicle ?? vehicleById.get(trip.vehicleId) ?? null
                }
                resolveDriver={(trip) =>
                  trip.driverId
                    ? (trip.driver ?? driverById.get(trip.driverId) ?? null)
                    : null
                }
                onEdit={(trip) => setMode({ kind: "edit", trip })}
                onDelete={(trip) => setPendingDelete(trip)}
                onRequestCancel={(trip) => setPendingCancel(trip)}
                onMoveToToday={(trip) => handleMoveToToday(trip)}
                onStatusChange={(trip, next, options) =>
                  handleStatusChange(trip, next, options)
                }
              />
              </div>
            );
          })}
          <Pagination
            page={tripList.page}
            pageSize={tripList.pageSize}
            highestKnownPage={tripList.highestKnownPage}
            totalPages={tripList.totalPages}
            isLastPageReached={tripList.isLastPageReached}
            isLoading={tripList.isLoading}
            onPageChange={(p) => void tripList.goToPage(p)}
            onPageSizeChange={tripList.setPageSize}
          />
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete trip?"
        description={
          pendingDelete ? (
            <>
              Permanently delete this trip from{" "}
              <span className="font-semibold text-primary">
                {formatLocationLine(
                  pendingDelete.startAddress,
                  pendingDelete.startCity,
                )}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-primary">
                {formatLocationLine(
                  pendingDelete.endAddress,
                  pendingDelete.endCity,
                )}
              </span>
              ? This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete trip"
        destructive
        onConfirm={async () => {
          if (pendingDelete) await handleConfirmedDelete(pendingDelete);
        }}
      />

      <ConfirmDialog
        open={pendingCancel !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCancel(null);
        }}
        title="Cancel this trip?"
        description={
          pendingCancel ? (
            <>
              Mark the trip from{" "}
              <span className="font-semibold text-primary">
                {formatLocationLine(
                  pendingCancel.startAddress,
                  pendingCancel.startCity,
                )}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-primary">
                {formatLocationLine(
                  pendingCancel.endAddress,
                  pendingCancel.endCity,
                )}
              </span>{" "}
              as cancelled? The record stays in the list but no further
              checkout / check-in is possible.
            </>
          ) : null
        }
        confirmLabel="Cancel trip"
        destructive
        onConfirm={async () => {
          if (pendingCancel) {
            await handleStatusChange(pendingCancel, "CANCELLED");
            setPendingCancel(null);
          }
        }}
      />
    </div>
  );
}

function TripGroupCard({
  groupKey,
  trips,
  driver,
  density,
  expanded,
  targetCount,
  customRoutes,
  onToggle,
  resolveVehicle,
  resolveDriver,
  onEdit,
  onDelete,
  onRequestCancel,
  onMoveToToday,
  onStatusChange,
}: {
  groupKey: string;
  trips: ApiTrip[];
  driver: TripDriverSummary | ApiDriver | null;
  density: "comfortable" | "compact";
  expanded: boolean;
  // Daily expected-trips target for the active date. Drives the donut
  // fill. Null while the value is still loading (the donut falls back
  // to a static-looking ring with the count in the middle).
  targetCount: number | null;
  // Admin-defined start/end presets, threaded through so each row's
  // distance display + check-in flow can prefer a saved route's
  // admin-recorded distance over a LocationIQ geocode/route guess.
  customRoutes: ApiCustomTripRoute[];
  onToggle: () => void;
  resolveVehicle: (trip: ApiTrip) => TripVehicleSummary | ApiVehicle | null;
  resolveDriver: (trip: ApiTrip) => TripDriverSummary | ApiDriver | null;
  onEdit: (trip: ApiTrip) => void;
  onDelete: (trip: ApiTrip) => void;
  onRequestCancel: (trip: ApiTrip) => void;
  // Reschedules a PLANNED trip that drifted into the past back to
  // today. Wired into the row's "Move to Today" action button which
  // replaces the Checkout / Cancel buttons for stale planned rows.
  onMoveToToday: (trip: ApiTrip) => void;
  onStatusChange: (
    trip: ApiTrip,
    next: TripStatus,
    options?: { distanceKm?: number | null },
  ) => Promise<void> | void;
}) {
  const regionId = `trip-group-${groupKey}`;
  const statusCounts = TRIP_STATUSES.map((status) => ({
    status,
    count: trips.filter((trip) => trip.status === status).length,
  })).filter((entry) => entry.count > 0);
  // Donut count = COMPLETED only. The donut tracks "trips that
  // actually finished today" toward the day's target, so PLANNED,
  // IN_PROGRESS, and CANCELLED rows are intentionally excluded.
  const donutCount = trips.filter(
    (trip) => trip.status === "COMPLETED",
  ).length;
  const driverName = driver
    ? `${driver.firstName} ${driver.lastName}`
    : "Unassigned driver";

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 shadow-sm shadow-primary/10">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={regionId}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UserRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-primary">{driverName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {statusCounts.map(({ status, count }) => (
              <span
                key={status}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                  TRIP_STATUS_PILL[status],
                )}
              >
                {count} {status.replace("_", " ")}
              </span>
            ))}
          </div>
        </div>
        <TripDonutBadge count={donutCount} target={targetCount} />
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-primary transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div
          id={regionId}
          role="region"
          aria-label={`Trips for ${driverName}`}
          className="space-y-2 border-t border-primary/15 bg-white/60 p-3 pl-4"
        >
          {trips.map((trip) => (
            <TripRow
              key={trip.id}
              trip={trip}
              vehicle={resolveVehicle(trip)}
              driver={resolveDriver(trip)}
              density={density}
              customRoutes={customRoutes}
              onEdit={() => onEdit(trip)}
              onDelete={() => onDelete(trip)}
              onRequestCancel={() => onRequestCancel(trip)}
              onMoveToToday={() => onMoveToToday(trip)}
              onStatusChange={(next, options) => onStatusChange(trip, next, options)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Circular donut badge that displays trip progress toward the day
// target. The middle text is the integer count of COMPLETED trips
// (planned, in-progress, and cancelled are intentionally excluded
// by the caller so the donut tracks actual completion only). The
// arc fill is `count / target`, clamped at 100% so a driver who
// over-delivered still shows a full ring instead of wrapping past
// 360 deg. When `target` is missing or zero, the ring renders as a
// thin background only and we lean on the centered count to carry
// the meaning.
function TripDonutBadge({
  count,
  target,
}: {
  count: number;
  target: number | null;
}) {
  const size = 44;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio =
    target && target > 0 ? Math.min(count / target, 1) : 0;
  const dashOffset = circumference - circumference * ratio;
  const label = target
    ? `${count} of ${target} target trips`
    : `${count} trips counted`;

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center text-primary"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
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
        {target ? (
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
        ) : null}
      </svg>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">
        {count}
      </span>
    </span>
  );
}

function TripRow({
  trip,
  vehicle,
  driver,
  density,
  customRoutes,
  onEdit,
  onDelete,
  onRequestCancel,
  onMoveToToday,
  onStatusChange,
}: {
  trip: ApiTrip;
  // Accept the slim summary so we can render whichever shape the trip
  // payload provides (nested on list responses) or the full ApiVehicle we
  // looked up locally â€” TripRow only needs the asset / plate fields.
  vehicle: TripVehicleSummary | ApiVehicle | null;
  driver: TripDriverSummary | ApiDriver | null;
  density: "comfortable" | "compact";
  // Saved Custom Trip Routes. When the trip's start/end address line
  // matches one, we use its admin-recorded distance for both the
  // check-in payload and the completed-row display instead of falling
  // back to LocationIQ (which can't be trusted for short names with no
  // coordinates).
  customRoutes?: ApiCustomTripRoute[];
  onEdit: () => void;
  onDelete: () => void;
  // Opens the cancel-confirmation dialog. The actual status transition
  // runs from the panel after the user confirms.
  onRequestCancel: () => void;
  // Reschedules a stale PLANNED trip back to today. Wired to the
  // "Move to Today" action that replaces Checkout / Cancel when a
  // planned trip's effective date has drifted into the past.
  onMoveToToday: () => void;
  onStatusChange: (
    next: TripStatus,
    options?: { distanceKm?: number | null },
  ) => Promise<void> | void;
}) {
  // Pre-compute the matching custom route once so every distance code
  // path in this row (check-in resolver, initial display state, and
  // background upgrade effect) reads from the same source of truth.
  const matchedCustomRoute = useMemo(
    () => findMatchingCustomRoute(trip, customRoutes),
    [trip, customRoutes],
  );
  // Tracks the in-flight status action so we can disable all three buttons
  // while a request is in progress and surface a spinner on the clicked one.
  const [pendingAction, setPendingAction] = useState<TripStatus | null>(null);
  const isBusy = pendingAction !== null;
  const { settings: timeSettings } = useTimeSettings();
  const canUpdateTrip = useCan("trips.update");
  const canDeleteTripPerm = useCan("trips.delete");

  // Local "checked out at" timestamp captured the moment the user taps the
  // button. We use this for the live elapsed counter instead of the server's
  // `startedAt` to dodge clock skew between the device (especially on mobile
  // hotspots / cellular) and the deployed API host. Without this the counter
  // can boot up showing 2+ minutes immediately after a successful checkout
  // because the device clock trails the server.
  const [localStartedAtMs, setLocalStartedAtMs] = useState<number | null>(null);

  async function runAction(next: TripStatus) {
    // Capture the click instant before awaiting so the local timer starts
    // from when the user actually tapped, not when the server response
    // comes back (which could add another 100â€“500ms of perceived delay).
    const clickedAt = Date.now();
    setPendingAction(next);
    try {
      // For check-in (COMPLETED) we compute the route distance now and
      // attach it to the status request so the backend can persist it
      // alongside the completedAt timestamp. We don't block the UI on
      // this if it takes too long â€” the API key may be missing or the
      // network slow â€” so we cap the lookup with a short timeout and
      // fall through with no distance if it doesn't resolve in time.
      let distanceKm: number | null = null;
      if (next === "COMPLETED") {
        distanceKm = await resolveCheckinDistanceKm(trip, customRoutes);
      }
      await onStatusChange(next, distanceKm !== null ? { distanceKm } : {});
      if (next === "IN_PROGRESS") {
        setLocalStartedAtMs(clickedAt);
      } else if (next === "COMPLETED" || next === "CANCELLED") {
        setLocalStartedAtMs(null);
      }
    } finally {
      setPendingAction(null);
    }
  }

  const serverStartedAtMs = trip.startedAt ? Date.parse(trip.startedAt) : null;
  // Prefer the local override while the trip is IN_PROGRESS so the running
  // counter ignores server clock skew. Once the trip is COMPLETED we fall
  // back to the server's authoritative startedAt to compute total duration.
  const startedAtMs =
    trip.status === "IN_PROGRESS" && localStartedAtMs !== null
      ? localStartedAtMs
      : serverStartedAtMs;
  const completedAtMs = trip.completedAt ? Date.parse(trip.completedAt) : null;

  // While the trip is IN_PROGRESS we tick once per second so the badge shows
  // a live elapsed time. For finished trips we just render the static
  // start->complete delta and skip the interval entirely.
  const liveElapsedMs = useLiveElapsed(
    trip.status === "IN_PROGRESS" ? startedAtMs : null,
  );
  const elapsedMs =
    trip.status === "IN_PROGRESS"
      ? liveElapsedMs
      : startedAtMs && completedAtMs
        ? completedAtMs - startedAtMs
        : null;

  // Distance shown on the completed row. Priority order:
  //   1. Admin-recorded distance from a matching Custom Trip Route.
  //      Wins over `trip.distanceKm` so historic trips that were
  //      checked-in before this fix (and therefore carry a bogus
  //      LocationIQ-derived distance) self-correct on next render.
  //   2. `trip.distanceKm` persisted on the trip itself (set when the
  //      user tapped Check-in via setTripStatus).
  //   3. Straight-line distance from saved start/end coords (instant
  //      fallback for older trips without the persisted figure).
  //   4. Driving distance from LocationIQ Directions after geocoding the
  //      saved addresses â€” last-resort upgrade for legacy trips.
  const [distanceKm, setDistanceKm] = useState<number | null>(() => {
    if (matchedCustomRoute) return customRouteDistanceKm(trip, matchedCustomRoute);
    if (typeof trip.distanceKm === "number") return trip.distanceKm;
    return trip.status === "COMPLETED" ? getTripDistanceKm(trip) : null;
  });
  useEffect(() => {
    if (trip.status !== "COMPLETED") {
      setDistanceKm(null);
      return;
    }
    if (matchedCustomRoute) {
      setDistanceKm(customRouteDistanceKm(trip, matchedCustomRoute));
      return;
    }
    if (typeof trip.distanceKm === "number") {
      setDistanceKm(trip.distanceKm);
      return;
    }
    const hasStartCoords =
      typeof trip.startLat === "number" && typeof trip.startLon === "number";
    const hasEndCoords =
      typeof trip.endLat === "number" && typeof trip.endLon === "number";
    if (hasStartCoords && hasEndCoords) {
      const straight = haversineKm(
        trip.startLat as number,
        trip.startLon as number,
        trip.endLat as number,
        trip.endLon as number,
      );
      setDistanceKm(trip.isRoundTrip ? straight * 2 : straight);
      return;
    }
    setDistanceKm(null);
  }, [
    trip,
    matchedCustomRoute,
    trip.status,
    trip.distanceKm,
    trip.startLat,
    trip.startLon,
    trip.endLat,
    trip.endLon,
    trip.isRoundTrip,
  ]);

  // A PLANNED trip whose effective date has slipped past today (the
  // driver never checked out on its scheduled day). Compared against
  // the user's local "today" key so the rule lines up with the date
  // tabs above the list.
  const isPlannedFromPast = useMemo(() => {
    if (trip.status !== "PLANNED") return false;
    const effective = getTripEffectiveDate(trip);
    if (!effective) return false;
    return toLocalDateKey(effective) < toLocalDateKey(new Date());
  }, [trip]);

  // Stale planned trips swap their checkout / cancel buttons for a
  // single "Move to Today" + "Delete" pair, so the regular workflow
  // controls hide. Otherwise the usual rules apply.
  const canCheckout =
    canUpdateTrip && trip.status === "PLANNED" && !isPlannedFromPast;
  const canCheckin = canUpdateTrip && trip.status === "IN_PROGRESS";
  const canCancel =
    canUpdateTrip &&
    (trip.status === "PLANNED" || trip.status === "IN_PROGRESS") &&
    !isPlannedFromPast;
  // Editing is restricted to PLANNED trips — once a trip has moved on
  // it becomes historical and can only change via the dedicated status
  // transition. Delete is hidden while IN_PROGRESS so a mid-flight trip
  // can't be wiped out without going through Check-in or Cancel first.
  // For stale planned trips the tiny edit / delete cluster is hidden
  // because "Move to Today" + "Delete" already covers the actions.
  const canEdit =
    canUpdateTrip && trip.status === "PLANNED" && !isPlannedFromPast;
  const canDelete =
    canDeleteTripPerm &&
    trip.status !== "IN_PROGRESS" &&
    !isPlannedFromPast;
  const canMoveStale =
    canUpdateTrip && isPlannedFromPast;
  const canDeleteStale = canDeleteTripPerm && isPlannedFromPast;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border bg-slate-50/50 transition-colors hover:bg-white",
        trip.status === "IN_PROGRESS"
          ? "border-amber-200 bg-amber-50/40 hover:border-amber-300"
          : "border-slate-100 hover:border-primary/30",
        density === "compact" ? "p-3" : "p-4",
      )}
    >
      <Link
        href={`/trips/${trip.id}`}
        className="group/link flex min-w-0 flex-1 items-center gap-3"
        aria-label="Open trip detail"
      >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Route className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        {/* Primary line: trip route. This is the row's headline now â€”
            the asset / plate string used to live here but it was
            visually outweighing the route. */}
        <p className="flex flex-wrap items-center gap-1.5 text-base font-bold text-primary">
          <span className="truncate">
            {formatLocationLine(
              trip.startAddress,
              trip.startCity,
              trip.startState,
            )}
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {formatLocationLine(
              trip.endAddress,
              trip.endCity,
              trip.endState,
            )}
          </span>
        </p>
        {/* Secondary: driver name â€” the next thing the eye should grab. */}
        {driver && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-primary/85">
            <UserRound className="size-3.5 shrink-0" />
            <span className="truncate">
              {driver.firstName} {driver.lastName}
            </span>
          </p>
        )}
        {/* Tertiary metadata: vehicle id, status pill, timer, last
            checkout time. Smaller and muted so it stays in the
            background. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Truck className="size-3 shrink-0" />
            <span className="font-medium">
              {vehicle
                ? `${vehicle.assetNumber ?? vehicle.plateNumber} Â· ${vehicle.plateNumber}`
                : "Unknown vehicle"}
            </span>
          </span>
          <TripStatusPill status={trip.status} />
          {trip.status === "IN_PROGRESS" && elapsedMs !== null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide text-amber-800 tabular-nums">
              <Timer className="size-3 animate-pulse" />
              {formatDuration(elapsedMs)}
            </span>
          )}
          {/* Check-out / check-in timestamps moved into the TripTimesInfo
              popover next to "Time taken" on completed trips. For in-progress
              trips we still surface the start time so the row carries some
              schedule context without the user having to open anything. */}
          {trip.status === "IN_PROGRESS" && trip.startedAt && (
            <span>
              Checked out{" "}
              <span className="font-semibold text-primary">
                {formatDateTime(trip.startedAt, timeSettings)}
              </span>
            </span>
          )}
        </div>
      </div>
      </Link>
      <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
        {trip.status === "COMPLETED" && (
          <TripCompletedStats
            durationMs={elapsedMs}
            distanceKm={distanceKm}
            startedAt={trip.startedAt}
            completedAt={trip.completedAt}
          />
        )}
        {isPlannedFromPast && (canMoveStale || canDeleteStale) && (
          <>
            {canMoveStale && (
              <TripActionButton
                tone="primary"
                onClick={onMoveToToday}
                disabled={isBusy}
                icon={Calendar}
              >
                Move to Today
              </TripActionButton>
            )}
            {canDeleteStale && (
              <TripActionButton
                tone="destructive"
                onClick={onDelete}
                disabled={isBusy}
                icon={Trash2}
              >
                Delete
              </TripActionButton>
            )}
          </>
        )}
        {canCheckout && (
          <TripActionButton
            tone="success"
            onClick={() => runAction("IN_PROGRESS")}
            disabled={isBusy}
            loading={pendingAction === "IN_PROGRESS"}
            icon={Play}
          >
            Trip Checkout
          </TripActionButton>
        )}
        {canCheckin && (
          <TripActionButton
            tone="primary"
            onClick={() => runAction("COMPLETED")}
            disabled={isBusy}
            loading={pendingAction === "COMPLETED"}
            icon={CircleCheck}
          >
            Trip Checkin
          </TripActionButton>
        )}
        {canCancel && (
          <TripActionButton
            tone="muted"
            onClick={onRequestCancel}
            disabled={isBusy}
            icon={Ban}
          >
            Cancel Trip
          </TripActionButton>
        )}
        {(canEdit || canDelete) && (
          <div className="flex items-center gap-1">
            {canEdit && (
              <button
                type="button"
                onClick={onEdit}
                disabled={isBusy}
                aria-label="Edit trip"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
              >
                <Pencil className="size-4" />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isBusy}
                aria-label="Delete trip"
                className="flex size-8 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        )}
        <Link
          href={`/trips/${trip.id}`}
          aria-label="Open trip detail"
          className="group/chev flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <ChevronRight className="size-4 transition-transform group-hover/chev:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

// Tiny button used by the three trip-status actions. Kept inline (rather
// than reusing the larger <Button>) so the row stays compact at every
// density and the tone variants can match the badge colors exactly.
function TripActionButton({
  tone,
  onClick,
  disabled,
  loading,
  icon: Icon,
  children,
}: {
  tone: "success" | "primary" | "muted" | "destructive";
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "bg-success text-white hover:bg-success/90 disabled:bg-success/60"
      : tone === "primary"
        ? "bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/60"
        : tone === "destructive"
          ? "bg-destructive text-white hover:bg-destructive/90 disabled:bg-destructive/60"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:bg-slate-100";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-80",
        toneClass,
      )}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Icon className="size-3.5" />
      )}
      {children}
    </button>
  );
}

// Compact vertical summary rendered in place of the action buttons for
// COMPLETED trips. Two flat rows (time, distance) stacked on top of each
// other and separated by a hairline rule â€” deliberately chrome-free so
// the panel reads as inline metadata, not a pair of buttons.
function TripCompletedStats({
  durationMs,
  distanceKm,
  startedAt,
  completedAt,
}: {
  durationMs: number | null;
  distanceKm: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
}) {
  const distanceLabel =
    distanceKm !== null ? formatDistance(distanceKm) : "—";

  return (
    <div className="mr-auto flex min-w-[170px] flex-col divide-y divide-slate-200/70 sm:mr-10">
      <CompletedStatCell
        icon={Timer}
        label="Time taken"
        value={durationMs !== null ? formatDuration(durationMs) : "â€”"}
        tone="success"
        infoSlot={
          <TripTimesInfo
            startedAt={startedAt ?? null}
            completedAt={completedAt ?? null}
          />
        }
      />
      <CompletedStatCell
        icon={Navigation}
        label="Distance"
        value={distanceLabel}
        tone="primary"
      />
    </div>
  );
}

function CompletedStatCell({
  icon: Icon,
  label,
  value,
  tone,
  infoSlot,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "success" | "primary";
  infoSlot?: ReactNode;
}) {
  const iconColor = tone === "success" ? "text-success" : "text-primary";
  const valueColor = tone === "success" ? "text-success" : "text-primary";
  return (
    <div className="flex items-center gap-2 py-1">
      <Icon className={cn("size-3.5 shrink-0", iconColor)} />
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
        {infoSlot}
      </span>
      <span
        className={cn(
          "ml-auto font-mono text-sm font-bold tabular-nums",
          valueColor,
        )}
      >
        {value}
      </span>
    </div>
  );
}

// Small info affordance next to the "Time taken" label that exposes the
// raw checkout/check-in timestamps. On desktop (>= sm) it behaves as a
// hover/focus tooltip anchored to the icon; on mobile it opens a centered
// modal-style sheet because hover isn't available and an anchored popover
// would be cramped on a small screen.
function TripTimesInfo({
  startedAt,
  completedAt,
}: {
  startedAt: string | null;
  completedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const { settings: timeSettings } = useTimeSettings();

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

  const checkedOut = startedAt ? formatDateTime(startedAt, timeSettings) : "â€”";
  const checkedIn = completedAt ? formatDateTime(completedAt, timeSettings) : "â€”";

  return (
    <span ref={wrapRef} className="group/info relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-primary focus:text-primary focus:outline-none"
        aria-label="Show check-out and check-in times"
        aria-expanded={open}
      >
        <Info className="size-3" />
      </button>

      {/* Mobile-only backdrop. Sits behind the modal, captures taps to close. */}
      {open && (
        <span
          className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
          aria-hidden
        />
      )}

      <span
        role="dialog"
        className={cn(
          // Mobile: centered modal sheet anchored to the viewport.
          "fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 text-left normal-case shadow-xl",
          // Desktop: small popover anchored to the icon.
          "sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-1.5 sm:w-[240px] sm:translate-y-0 sm:p-3",
          open ? "block" : "hidden",
          // Desktop hover/focus also reveals the popover.
          "sm:group-hover/info:block sm:group-focus-within/info:block",
        )}
      >
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase sm:text-[10px]">
          Trip times
        </p>
        <dl className="mt-2 space-y-1.5 text-xs sm:mt-1.5 sm:text-[11px]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Checked out</dt>
            <dd className="text-right font-semibold text-primary">
              {checkedOut}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Checked in</dt>
            <dd className="text-right font-semibold text-primary">
              {checkedIn}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
          className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200 sm:hidden"
        >
          Close
        </button>
      </span>
    </span>
  );
}

// React hook that re-renders once per second while a start timestamp is
// present, so the elapsed-time badge updates live without re-fetching the
// trip from the server. Returns null when no start time is set.
function useLiveElapsed(startedAtMs: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAtMs === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAtMs]);
  if (startedAtMs === null) return null;
  return Math.max(0, now - startedAtMs);
}

function TripStatusPill({ status }: { status: TripStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
        TRIP_STATUS_PILL[status],
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function EmptyState({ hasVehicles }: { hasVehicles: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Route className="size-6" />
      </span>
      <div>
        <p className="text-sm font-semibold text-primary">No trips yet</p>
        <p className="text-xs text-muted-foreground">
          {hasVehicles
            ? "Create your first trip by selecting a vehicle and its route."
            : "Register vehicles first, then plan trips between locations."}
        </p>
      </div>
    </div>
  );
}

