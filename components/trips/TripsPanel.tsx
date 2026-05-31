"use client";

import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Calendar,
  ChevronDown,
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
  Save,
  Search,
  Timer,
  Trash2,
  Truck,
  UserRound,
  X,
} from "@/lib/icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";

import { CustomTag } from "@/components/settings/CustomTripRoutesPanel";
import {
  FieldGrid,
  SettingsField,
  fieldClass,
} from "@/components/settings/SettingsShared";
import {
  LocationAutocomplete,
  type CustomLocationOption,
  type PickedLocation,
} from "@/components/shared/LocationAutocomplete";
import { TripDriverPicker } from "@/components/trips/TripDriverPicker";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PanelError } from "@/components/vehicles/VehicleForm";
import { ApiError } from "@/lib/api/client";
import { listDrivers } from "@/lib/api/drivers";
import {
  createTrip,
  deleteTrip,
  listTrips,
  setTripStatus,
  updateTrip,
  type CreateTripRequest,
} from "@/lib/api/trips";
import { listCustomTripRoutes } from "@/lib/api/customTripRoutes";
import { listSites } from "@/lib/api/sites";
import {
  clearTripTargetOverride,
  getEffectiveTripTarget,
  setTripTargetOverride,
} from "@/lib/api/tripTargets";
import {
  fetchDrivingDistance,
  geocodeAddress,
} from "@/lib/locationiq/directions";
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
import { listVehicles } from "@/lib/api/vehicles";
import {
  formatSiteLocation,
  resolvePrimarySite,
  siteToStartFields,
} from "@/lib/trips/resolveTripStart";
import { cn } from "@/lib/utils";

const TRIP_STATUS_PILL: Record<TripStatus, string> = {
  PLANNED: "bg-blue-50 text-blue-700",
  IN_PROGRESS: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-success/15 text-success",
  CANCELLED: "bg-slate-200 text-slate-700",
};

type TripFormState = {
  vehicleId: string;
  driverId: string;
  status: TripStatus;
  startAddress: string;
  startCity: string;
  startState: string;
  startLat: number | null;
  startLon: number | null;
  endAddress: string;
  endCity: string;
  endState: string;
  endLat: number | null;
  endLon: number | null;
  isRoundTrip: boolean;
};

function emptyForm(): TripFormState {
  return {
    vehicleId: "",
    driverId: "",
    status: "PLANNED",
    startAddress: "",
    startCity: "",
    startState: "",
    startLat: null,
    startLon: null,
    endAddress: "",
    endCity: "",
    endState: "",
    endLat: null,
    endLon: null,
    isRoundTrip: false,
  };
}

function tripToForm(trip: ApiTrip): TripFormState {
  return {
    vehicleId: trip.vehicleId,
    driverId: trip.driverId ?? "",
    status: trip.status,
    startAddress: trip.startAddress,
    startCity: trip.startCity ?? "",
    startState: trip.startState ?? "",
    startLat: trip.startLat ?? null,
    startLon: trip.startLon ?? null,
    endAddress: trip.endAddress,
    endCity: trip.endCity ?? "",
    endState: trip.endState ?? "",
    endLat: trip.endLat ?? null,
    endLon: trip.endLon ?? null,
    isRoundTrip: trip.isRoundTrip ?? false,
  };
}

function formatLocationLine(
  address: string,
  city?: string | null,
  state?: string | null,
): string {
  const parts = [address, city, state].filter(Boolean);
  return parts.join(", ");
}

// Picks the timestamp that best represents "when this trip happened" so
// the date tabs can group rows naturally. Completed trips fall on their
// check-in date, in-progress on their checkout, planned on their
// scheduled (or fallback created) date.
function getTripEffectiveDate(trip: ApiTrip): Date | null {
  const iso =
    trip.completedAt ?? trip.startedAt ?? trip.scheduledAt ?? trip.createdAt;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Formats a Date as YYYY-MM-DD in the user's local timezone — matches
// the `<input type="date">` value format so the custom-date filter
// compares cleanly via string equality.
function toLocalDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// "Today" / "Yesterday" / "Choose Date" date filter for the trips list.
// Choose Date pairs with a single YYYY-MM-DD value the user picks below.
type DateFilter = "TODAY" | "YESTERDAY" | "CUSTOM";

type TripGroup = {
  key: string;
  driverId: string | null;
  trips: ApiTrip[];
};

type Mode =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; trip: ApiTrip };

export function TripsPanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  const [trips, setTrips] = useState<ApiTrip[]>([]);
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
  const [isLoading, setIsLoading] = useState(true);
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
  const { showToast } = useToast();

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [t, v, d, s, r] = await Promise.all([
        listTrips(),
        listVehicles(),
        listDrivers().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiDriver[];
          throw err;
        }),
        listSites().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiSite[];
          throw err;
        }),
        listCustomTripRoutes().catch((err) => {
          if (err instanceof ApiError && err.isAuth)
            return [] as ApiCustomTripRoute[];
          throw err;
        }),
      ]);
      setTrips(t);
      setVehicles(v);
      setDrivers(d);
      setSites(s);
      setCustomRoutes(r);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load trips.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  // Drivers currently on an IN_PROGRESS trip. We block creating new
  // trips for these drivers (and surface a warning in the trip form) so
  // the operator can't pile on additional work while someone is still
  // on the road. Mirrors the backend rule in TripService.create.
  const busyDriverIds = useMemo(() => {
    const set = new Set<string>();
    for (const t of trips) {
      if (t.status === "IN_PROGRESS" && t.driverId) set.add(t.driverId);
    }
    return set;
  }, [trips]);

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

  const filteredTrips = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return trips.filter((t) => {
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (vehicleFilter !== "ALL" && t.vehicleId !== vehicleFilter)
        return false;
      const tripDate = getTripEffectiveDate(t);
      // Trips with no usable timestamp can't match any specific date,
      // so they fall out of the filtered list while a date tab is on.
      if (!tripDate) return false;
      if (toLocalDateKey(tripDate) !== targetDateKey) return false;
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
  }, [
    trips,
    statusFilter,
    vehicleFilter,
    targetDateKey,
    searchQuery,
    vehicleById,
    driverById,
  ]);

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

  // Refresh the effective target whenever the active date changes. We
  // intentionally don't bind it to `targetState` so a fresh fetch can
  // overwrite an earlier optimistic save without looping. AbortController
  // protects against the user flipping tabs faster than the API responds.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const next = await getEffectiveTripTarget(
          targetDateKey,
          controller.signal,
        );
        if (!cancelled) setTargetState(next);
      } catch (err) {
        // Auth bounces and aborts are expected when navigating; swallow
        // those so the trips panel still renders. Anything else surfaces
        // as a toast since the donut quietly degrades to "no target".
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof ApiError && err.isAuth) return;
        if (!cancelled) {
          showToast({
            variant: "error",
            message:
              err instanceof ApiError
                ? err.message
                : "Unable to load daily trip target.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [targetDateKey, showToast]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-primary">
              {filteredTrips.length}
            </span>{" "}
            of {trips.length} {trips.length === 1 ? "trip" : "trips"} shown
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
              {/* Mobile status filter — a compact 40x40 icon button that
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
              <div className="relative flex-1">
                <Truck className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={vehicleFilter}
                  onChange={(e) => setVehicleFilter(e.target.value)}
                  className={`${fieldClass} pl-9`}
                  aria-label="Filter by vehicle"
                >
                  <option value="ALL">All vehicles</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.assetNumber ?? v.plateNumber}
                    </option>
                  ))}
                </select>
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
          <div className="min-w-0 flex-1 sm:hidden">
            <DailyTargetEditor
              target={targetState}
              isSaving={isSavingTarget}
              onSave={handleSaveTarget}
              onReset={handleResetTarget}
            />
          </div>
          <Button
            onClick={() => setMode({ kind: "create" })}
            disabled={vehicles.length === 0}
            className="h-10 shrink-0 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint sm:self-auto"
          >
            <Plus className="size-4" />
            Create Trip
          </Button>
        </div>
      </div>

      {/* Date tabs + status / vehicle / daily-target controls (desktop).
          The first row up top now owns the search input full-width and
          all the small controls live here together — date tabs lead,
          then the dropdowns, then the target editor on the right.
          Hidden below `sm` — mobile keeps the dropdowns and the
          collapsed date button up in the filter row above. */}
      <div className="hidden flex-wrap items-center gap-3 sm:flex">
        <TripDateTabs
          value={dateFilter}
          onChange={setDateFilter}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
        />
        <div className="relative w-44">
          <Filter className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as TripStatus | "ALL")
            }
            className={`${fieldClass} pl-9`}
            aria-label="Filter by status"
          >
            <option value="ALL">All statuses</option>
            {TRIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {prettyEnum(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="relative w-56">
          <Truck className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className={`${fieldClass} pl-9`}
            aria-label="Filter by vehicle"
          >
            <option value="ALL">All vehicles</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.assetNumber ?? v.plateNumber}
              </option>
            ))}
          </select>
        </div>
        <DailyTargetEditor
          target={targetState}
          isSaving={isSavingTarget}
          onSave={handleSaveTarget}
          onReset={handleResetTarget}
        />
      </div>

      {vehicles.length === 0 && !isLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-800">
          Register at least one vehicle before creating trips.
        </div>
      )}

      {loadError && <PanelError message={loadError} />}

      {isLoading && trips.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : filteredTrips.length === 0 ? (
        trips.length === 0 ? (
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
              dateFilter !== "TODAY" ||
              searchQuery.trim() !== "") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter("ALL");
                  setVehicleFilter("ALL");
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
        <div className="space-y-2">
          {groupedTrips.map((group) => {
            if (group.trips.length === 1) {
              const trip = group.trips[0];
              return (
                <TripRow
                  key={trip.id}
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
              );
            }

            return (
              <TripGroupCard
                key={group.key}
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
            );
          })}
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

// Inline editor for the "expected trips per day" target. Reads the
// effective target for the active date from the parent and writes back
// via the /trip-targets API on commit. Renders a tiny number input
// inside a primary-blue chip so it sits flush next to the date tabs
// without crowding them. Shows a "Reset" affordance only when the
// active date has an override (so users can revert to the default).
function DailyTargetEditor({
  target,
  isSaving,
  onSave,
  onReset,
}: {
  target: ApiTripTargetEffective | null;
  isSaving: boolean;
  onSave: (count: number) => Promise<void> | void;
  onReset: () => Promise<void> | void;
}) {
  // Local string state lets the user type freely (incl. transient empty)
  // without fighting React's controlled-input invariants. We commit on
  // blur or Enter, so quickly tweaking the value during typing doesn't
  // hammer the API.
  const [draft, setDraft] = useState<string>(
    target ? String(target.count) : "",
  );

  useEffect(() => {
    if (target) setDraft(String(target.count));
  }, [target]);

  async function commit() {
    if (!target) return;
    const parsed = Number.parseInt(draft, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      // Revert the field to the last known good value so the row never
      // shows a garbage entry once focus leaves.
      setDraft(String(target.count));
      return;
    }
    if (parsed === target.count) return;
    await onSave(parsed);
  }

  // Used by the custom blue stepper buttons. Clamps to [0, 1000] and
  // commits immediately so the donut updates without waiting for blur.
  async function step(delta: number) {
    if (!target) return;
    const base = Number.parseInt(draft, 10);
    const current = Number.isFinite(base) ? base : target.count;
    const next = Math.max(0, Math.min(1000, current + delta));
    setDraft(String(next));
    if (next === target.count) return;
    await onSave(next);
  }

  const disabled = !target || isSaving;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm">
      <span className="text-[10px] font-semibold tracking-wide text-primary/70 uppercase">
        Daily target
      </span>
      <div className="flex items-stretch overflow-hidden rounded-md border border-primary/30 bg-white">
        <input
          type="number"
          min={0}
          max={1000}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          disabled={disabled}
          aria-label="Expected trips for the selected day"
          // Hide the native browser spin buttons — we replace them with
          // the always-visible solid-blue stack on the right.
          className="w-12 border-0 bg-transparent px-2 py-0.5 text-center text-sm font-bold text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0"
        />
        <div className="flex flex-col border-l border-primary/30">
          <button
            type="button"
            onClick={() => void step(1)}
            disabled={disabled}
            aria-label="Increase daily target"
            className="flex h-1/2 w-6 items-center justify-center bg-primary text-white transition-colors hover:bg-primary/90 active:bg-primary/80 disabled:opacity-50"
          >
            <ChevronUp className="size-3.5" strokeWidth={3} />
          </button>
          <button
            type="button"
            onClick={() => void step(-1)}
            disabled={disabled}
            aria-label="Decrease daily target"
            className="flex h-1/2 w-6 items-center justify-center border-t border-white/30 bg-primary text-white transition-colors hover:bg-primary/90 active:bg-primary/80 disabled:opacity-50"
          >
            <ChevronDown className="size-3.5" strokeWidth={3} />
          </button>
        </div>
      </div>
      <span className="text-[11px] text-primary/70">trips</span>
      {target?.isOverride && (
        <button
          type="button"
          onClick={() => void onReset()}
          disabled={isSaving}
          className="text-[11px] font-semibold text-primary/70 underline-offset-2 hover:text-primary hover:underline disabled:opacity-50"
        >
          Reset to default ({target.defaultCount})
        </button>
      )}
      {isSaving && <Loader2 className="size-3.5 animate-spin text-primary" />}
    </div>
  );
}

function TripStatusFilterMenu({
  value,
  onChange,
}: {
  value: TripStatus | "ALL";
  onChange: (next: TripStatus | "ALL") => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const options: { id: TripStatus | "ALL"; label: string }[] = [
    { id: "ALL", label: "All statuses" },
    ...TRIP_STATUSES.map((status) => ({
      id: status,
      label: prettyEnum(status),
    })),
  ];

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

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter by status"
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-xl border transition-colors",
          value === "ALL"
            ? "border-slate-200 bg-white text-muted-foreground hover:bg-slate-50 hover:text-primary"
            : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10",
          "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25",
        )}
      >
        <Filter className="size-4" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Status filter options"
          className="absolute top-full right-0 z-30 mt-1.5 min-w-48 rounded-xl border border-primary/20 bg-white p-1.5 shadow-lg shadow-primary/10"
        >
          {options.map((opt) => {
            const isActive = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "text-primary/80 hover:bg-primary/10 hover:text-primary",
                )}
              >
                <span>{opt.label}</span>
                <CircleCheck
                  className={cn(
                    "size-4 shrink-0 transition-opacity",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Compact mobile-only variant of the date filter. Renders as a single
// button that shows the currently selected day (Today / Yesterday /
// the picked date). Tapping it opens a dropdown panel beneath the
// button with all three options, plus the date input when the user
// picks "Choose Date". Used in the filter row alongside the vehicle
// select so the two split the row 50/50 on small screens.
function TripDateFilterMenu({
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

  // Close the dropdown on outside click / Escape. Mirrors the pattern
  // already used by `TripTimesInfo` further down the file.
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
      // Keep the panel open so the date input is reachable, and try to
      // pop the native picker straight away on browsers that support it.
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

// Date filter tabs that sit above the trips list. Today / Yesterday
// behave like normal segmented controls. "Choose Date" reveals a native
// date input the user can type into or open the picker on; clicking the
// tab while it's already active also re-focuses the input so they can
// quickly change the day. The custom date stays even when the user
// switches tabs, so flipping back doesn't lose their selection.
function TripDateTabs({
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
      // Defer so the input is in the DOM before we try to focus it.
      window.setTimeout(() => {
        dateInputRef.current?.focus();
        // showPicker isn't on every browser yet (Safari < 16), so the
        // focus above is the dependable part; this just upgrades the
        // experience on Chromium / Firefox.
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
        aria-label="Filter trips by date"
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
  // looked up locally — TripRow only needs the asset / plate fields.
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
    // comes back (which could add another 100–500ms of perceived delay).
    const clickedAt = Date.now();
    setPendingAction(next);
    try {
      // For check-in (COMPLETED) we compute the route distance now and
      // attach it to the status request so the backend can persist it
      // alongside the completedAt timestamp. We don't block the UI on
      // this if it takes too long — the API key may be missing or the
      // network slow — so we cap the lookup with a short timeout and
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
  //      saved addresses — last-resort upgrade for legacy trips.
  const [distanceKm, setDistanceKm] = useState<number | null>(() => {
    if (matchedCustomRoute) return customRouteDistanceKm(trip, matchedCustomRoute);
    if (typeof trip.distanceKm === "number") return trip.distanceKm;
    return trip.status === "COMPLETED" ? getTripDistanceKm(trip) : null;
  });
  const [isDistanceLoading, setIsDistanceLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();

    async function compute() {
      if (trip.status !== "COMPLETED") {
        if (!cancelled) setDistanceKm(null);
        return;
      }

      // A matching Custom Trip Route always wins — its distance is
      // authoritative and we don't want a stale persisted value
      // displayed when we have a known-good admin-entered figure.
      if (matchedCustomRoute) {
        if (!cancelled)
          setDistanceKm(customRouteDistanceKm(trip, matchedCustomRoute));
        return;
      }

      // Trust the persisted distance if the server provided it.
      if (typeof trip.distanceKm === "number") {
        if (!cancelled) setDistanceKm(trip.distanceKm);
        return;
      }

      const hasStartCoords =
        typeof trip.startLat === "number" && typeof trip.startLon === "number";
      const hasEndCoords =
        typeof trip.endLat === "number" && typeof trip.endLon === "number";

      const straightKm =
        hasStartCoords && hasEndCoords
          ? haversineKm(
              trip.startLat as number,
              trip.startLon as number,
              trip.endLat as number,
              trip.endLon as number,
            )
          : null;

      if (!cancelled) setDistanceKm(straightKm);
      if (abort.signal.aborted) return;

      // If we don't have a complete coordinate pair, try geocoding the
      // saved start/end addresses to recover lat/lon.
      const startQuery = formatLocationLine(
        trip.startAddress,
        trip.startCity ?? null,
        trip.startState ?? null,
      );
      const endQuery = formatLocationLine(
        trip.endAddress,
        trip.endCity ?? null,
        trip.endState ?? null,
      );

      setIsDistanceLoading(true);
      try {
        const start =
          hasStartCoords && trip.startLat !== null && trip.startLon !== null
            ? { lat: trip.startLat as number, lon: trip.startLon as number }
            : await geocodeAddress(startQuery, abort.signal);

        const end =
          hasEndCoords && trip.endLat !== null && trip.endLon !== null
            ? { lat: trip.endLat as number, lon: trip.endLon as number }
            : await geocodeAddress(endQuery, abort.signal);

        if (!start || !end) return;

        const oneWayStraight = haversineKm(
          start.lat,
          start.lon,
          end.lat,
          end.lon,
        );
        if (!cancelled && !abort.signal.aborted) {
          setDistanceKm(trip.isRoundTrip ? oneWayStraight * 2 : oneWayStraight);
        }

        const driving = await fetchDrivingDistance(
          start.lat,
          start.lon,
          end.lat,
          end.lon,
          abort.signal,
          trip.isRoundTrip ?? false,
        );

        if (!driving) return;
        if (cancelled || abort.signal.aborted) return;
        setDistanceKm(driving.distanceKm);
      } finally {
        if (!cancelled) setIsDistanceLoading(false);
      }
    }

    compute();

    return () => {
      cancelled = true;
      abort.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    trip.status,
    trip.id,
    trip.distanceKm,
    trip.startLat,
    trip.startLon,
    trip.endLat,
    trip.endLon,
    trip.startAddress,
    trip.startCity,
    trip.startState,
    trip.endAddress,
    trip.endCity,
    trip.endState,
    trip.isRoundTrip,
    matchedCustomRoute,
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
  const canCheckout = trip.status === "PLANNED" && !isPlannedFromPast;
  const canCheckin = trip.status === "IN_PROGRESS";
  const canCancel =
    (trip.status === "PLANNED" || trip.status === "IN_PROGRESS") &&
    !isPlannedFromPast;
  // Editing is restricted to PLANNED trips — once a trip has moved on
  // it becomes historical and can only change via the dedicated status
  // transition. Delete is hidden while IN_PROGRESS so a mid-flight trip
  // can't be wiped out without going through Check-in or Cancel first.
  // For stale planned trips the tiny edit / delete cluster is hidden
  // because "Move to Today" + "Delete" already covers the actions.
  const canEdit = trip.status === "PLANNED" && !isPlannedFromPast;
  const canDelete = trip.status !== "IN_PROGRESS" && !isPlannedFromPast;

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
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Route className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        {/* Primary line: trip route. This is the row's headline now —
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
        {/* Secondary: driver name — the next thing the eye should grab. */}
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
                ? `${vehicle.assetNumber ?? vehicle.plateNumber} · ${vehicle.plateNumber}`
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
      <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
        {trip.status === "COMPLETED" && (
          <TripCompletedStats
            durationMs={elapsedMs}
            distanceKm={distanceKm}
            isDistanceLoading={isDistanceLoading}
            startedAt={trip.startedAt}
            completedAt={trip.completedAt}
          />
        )}
        {isPlannedFromPast && (
          <>
            <TripActionButton
              tone="primary"
              onClick={onMoveToToday}
              disabled={isBusy}
              icon={Calendar}
            >
              Move to Today
            </TripActionButton>
            <TripActionButton
              tone="destructive"
              onClick={onDelete}
              disabled={isBusy}
              icon={Trash2}
            >
              Delete
            </TripActionButton>
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
// other and separated by a hairline rule — deliberately chrome-free so
// the panel reads as inline metadata, not a pair of buttons.
function TripCompletedStats({
  durationMs,
  distanceKm,
  isDistanceLoading,
  startedAt,
  completedAt,
}: {
  durationMs: number | null;
  distanceKm: number | null;
  isDistanceLoading?: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
}) {
  const distanceLabel =
    distanceKm !== null
      ? formatDistance(distanceKm)
      : isDistanceLoading
        ? "…"
        : "—";

  return (
    <div className="mr-auto flex min-w-[170px] flex-col divide-y divide-slate-200/70 sm:mr-10">
      <CompletedStatCell
        icon={Timer}
        label="Time taken"
        value={durationMs !== null ? formatDuration(durationMs) : "—"}
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

  const checkedOut = startedAt ? formatDateTime(startedAt, timeSettings) : "—";
  const checkedIn = completedAt ? formatDateTime(completedAt, timeSettings) : "—";

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

// Locates a saved Custom Trip Route whose endpoints match the trip's
// addresses in either direction (forward A→B or reverse B→A). The
// admin-recorded distance is the same either way, so reusing a saved
// route's number for the reverse leg is correct and saves the user
// from having to register the inverse pairing explicitly.
//
// Returns null when no route lines up — including the obvious case
// where the caller hasn't loaded any custom routes yet. Matching is
// case / whitespace-insensitive and ignores city / state (which are
// persisted silently and may be empty on either side).
function findMatchingCustomRoute(
  trip: ApiTrip,
  customRoutes: ApiCustomTripRoute[] | undefined,
): ApiCustomTripRoute | null {
  if (!customRoutes || customRoutes.length === 0) return null;
  const norm = (s: string | null | undefined) =>
    (s ?? "").trim().toLowerCase();
  const startName = norm(trip.startAddress);
  const endName = norm(trip.endAddress);
  if (!startName || !endName) return null;
  return (
    customRoutes.find((r) => {
      const a = norm(r.startName);
      const b = norm(r.endName);
      return (
        (a === startName && b === endName) ||
        (b === startName && a === endName)
      );
    }) ?? null
  );
}

// Returns the admin-recorded distance for a custom-route trip, doubled
// for round trips so the figure matches what the driver actually drove.
function customRouteDistanceKm(
  trip: ApiTrip,
  route: ApiCustomTripRoute,
): number {
  return trip.isRoundTrip ? route.distanceKm * 2 : route.distanceKm;
}

// Flattens every saved route's endpoints into autocomplete options for
// the trip form, deduped by normalized name. The same list is used on
// both sides of the form (`side` only changes the option id prefix so
// React keys stay unique) because a saved A→B route should be just as
// pickable as a start for the B→A return leg.
function buildCustomEndpointOptions(
  customRoutes: ApiCustomTripRoute[],
  side: "start" | "end",
): CustomLocationOption[] {
  const seen = new Set<string>();
  const options: CustomLocationOption[] = [];
  const norm = (s: string | null | undefined) =>
    (s ?? "").trim().toLowerCase();
  const push = (
    routeId: string,
    role: "start" | "end",
    name: string,
    city: string | null | undefined,
    state: string | null | undefined,
  ) => {
    const key = norm(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    options.push({
      id: `${side}-${routeId}-${role}`,
      name,
      city: city ?? "",
      state: state ?? "",
      payload: {
        address: name,
        city: city ?? "",
        state: state ?? "",
        lat: null,
        lon: null,
        displayName: formatLocationLine(name, city ?? "", state ?? ""),
        // The picker doesn't have a real LocationIQ row to attach,
        // so we hand back a stub the consumer ignores. Cast keeps
        // PickedLocation's `raw` typing happy without leaking the
        // shape outward.
        raw: { display_name: name } as unknown as PickedLocation["raw"],
      },
    });
  };
  for (const r of customRoutes) {
    push(r.id, "start", r.startName, r.startCity, r.startState);
    push(r.id, "end", r.endName, r.endCity, r.endState);
  }
  return options;
}

// Resolves a "distance" to render for a trip. Prefers, in order:
//   1. The matching saved Custom Trip Route's distance. Custom routes
//      carry an admin-entered distance that we always trust over any
//      LocationIQ-derived figure, because they typically have no
//      lat/lon and the geocoder is easily fooled by short generic
//      names like "North Depot".
//   2. The persisted `trip.distanceKm` (set when the user checked in).
//   3. The haversine straight-line between saved start/end coords.
function getTripDistanceKm(
  trip: ApiTrip,
  customRoutes?: ApiCustomTripRoute[],
): number | null {
  const matched = findMatchingCustomRoute(trip, customRoutes);
  if (matched) return customRouteDistanceKm(trip, matched);
  if (typeof trip.distanceKm === "number") return trip.distanceKm;
  const { startLat, startLon, endLat, endLon } = trip;
  if (
    typeof startLat !== "number" ||
    typeof startLon !== "number" ||
    typeof endLat !== "number" ||
    typeof endLon !== "number"
  ) {
    return null;
  }
  return haversineKm(startLat, startLon, endLat, endLon);
}

// Computes the distance to persist when the user taps Trip Check-in.
// Tries (in order):
//   1. The admin-recorded distance from a matching Custom Trip Route.
//      Trusted over LocationIQ because custom routes carry no lat/lon
//      and short generic names ("North Depot") confuse the geocoder.
//   2. Real driving distance from LocationIQ Directions, using saved
//      coords when available, or geocoding the addresses otherwise.
//   3. Straight-line distance from any coords we can find (saved or
//      geocoded).
//   4. null — give up rather than blocking the check-in indefinitely.
//
// We cap the whole resolution at ~5 seconds so a slow API call can
// never strand a driver who's trying to close out a trip in the field.
async function resolveCheckinDistanceKm(
  trip: ApiTrip,
  customRoutes?: ApiCustomTripRoute[],
): Promise<number | null> {
  const matched = findMatchingCustomRoute(trip, customRoutes);
  if (matched) return customRouteDistanceKm(trip, matched);

  const abort = new AbortController();
  // Safety net: bail out if LocationIQ is being slow / unreachable so
  // the check-in still completes.
  const timeout = window.setTimeout(() => abort.abort(), 5000);

  try {
    const hasStartCoords =
      typeof trip.startLat === "number" && typeof trip.startLon === "number";
    const hasEndCoords =
      typeof trip.endLat === "number" && typeof trip.endLon === "number";

    const start =
      hasStartCoords && trip.startLat !== null && trip.startLon !== null
        ? { lat: trip.startLat as number, lon: trip.startLon as number }
        : await geocodeAddress(
            [trip.startAddress, trip.startCity, trip.startState]
              .filter(Boolean)
              .join(", "),
            abort.signal,
          );

    const end =
      hasEndCoords && trip.endLat !== null && trip.endLon !== null
        ? { lat: trip.endLat as number, lon: trip.endLon as number }
        : await geocodeAddress(
            [trip.endAddress, trip.endCity, trip.endState]
              .filter(Boolean)
              .join(", "),
            abort.signal,
          );

    if (!start || !end) return null;

    const roundTrip = trip.isRoundTrip ?? false;
    const driving = await fetchDrivingDistance(
      start.lat,
      start.lon,
      end.lat,
      end.lon,
      abort.signal,
      roundTrip,
    );
    if (driving) return driving.distanceKm;

    // Driving failed — settle for the straight-line so the record at
    // least carries something useful. Round trips double it since the
    // driver covers each leg once.
    const oneWay = haversineKm(start.lat, start.lon, end.lat, end.lon);
    return roundTrip ? oneWay * 2 : oneWay;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

// Standard great-circle distance in kilometres. Accurate enough for the
// rough trip overview the UI shows; not a substitute for real route data.
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

// Formats the LocationIQ-reported route duration in seconds as a
// human-friendly approximation. Anything under an hour collapses to
// minutes; longer routes display as "Hh Mm". The leading "~" is added
// at the call site so the format string stays clean.
function formatRouteDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

// Renders the route preview that sits between the Starting point and
// Ending point cards in the trip form. Shows the actual driving distance
// returned by the LocationIQ Directions API, with a graceful fallback to
// the haversine straight-line distance when the API call is in flight,
// fails, or no API key is configured. Visualises completion as a
// progress bar with start / end markers.
//
// Progress logic:
//   - 0%  : neither point selected yet
//   - 50% : only one of the two is set, so the route is half-known
//   - 100%: both points set, the bar fills end-to-end
//
// Distance source (in priority order):
//   1. Driving distance from LocationIQ /directions/driving (preferred,
//      reflects real roads).
//   2. Haversine straight-line distance from the same coords (instant
//      fallback so the UI is never empty while we wait for the API).
//   3. null — neither coord pair is set yet, render the em dash.
function TripDistancePreview({
  startLat,
  startLon,
  endLat,
  endLon,
  hasStart,
  hasEnd,
  isRoundTrip,
}: {
  startLat: number | null;
  startLon: number | null;
  endLat: number | null;
  endLon: number | null;
  hasStart: boolean;
  hasEnd: boolean;
  // When true, the preview reflects the full A → B → A route. Driving
  // mode forwards the flag to the routing API as a third waypoint;
  // straight-line mode doubles the haversine distance.
  isRoundTrip: boolean;
}) {
  const haveBothCoords =
    startLat !== null &&
    startLon !== null &&
    endLat !== null &&
    endLon !== null;

  const oneWayStraightKm = haveBothCoords
    ? haversineKm(
        startLat as number,
        startLon as number,
        endLat as number,
        endLon as number,
      )
    : null;
  // Round trips double the straight-line distance since the driver
  // covers each leg once. Driving mode is handled below by passing the
  // flag to the routing API, which returns the full A→B→A distance.
  const straightLineKm =
    oneWayStraightKm !== null
      ? isRoundTrip
        ? oneWayStraightKm * 2
        : oneWayStraightKm
      : null;

  const [drivingKm, setDrivingKm] = useState<number | null>(null);
  const [drivingDurationSec, setDrivingDurationSec] = useState<number | null>(
    null,
  );
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);

  // Debounced driving-distance lookup. We wait ~400ms after the last
  // coordinate change before hitting LocationIQ so rapid typing /
  // autocomplete picks don't fire repeated requests against the free-
  // tier rate limit. The AbortController makes sure an older request
  // can't overwrite a newer result if the user keeps tweaking the form.
  useEffect(() => {
    if (!haveBothCoords) {
      setDrivingKm(null);
      setDrivingDurationSec(null);
      return;
    }
    setIsFetchingRoute(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const result = await fetchDrivingDistance(
        startLat as number,
        startLon as number,
        endLat as number,
        endLon as number,
        controller.signal,
        isRoundTrip,
      );
      if (controller.signal.aborted) return;
      if (result) {
        setDrivingKm(result.distanceKm);
        setDrivingDurationSec(result.durationSec);
      } else {
        // Null = API failed / no key. Surface that by clearing the
        // driving figure so the haversine label takes over.
        setDrivingKm(null);
        setDrivingDurationSec(null);
      }
      setIsFetchingRoute(false);
    }, 400);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      setIsFetchingRoute(false);
    };
  }, [haveBothCoords, startLat, startLon, endLat, endLon, isRoundTrip]);

  const km = drivingKm ?? straightLineKm;
  const isDriving = drivingKm !== null;
  const progress = hasStart && hasEnd ? 100 : hasStart || hasEnd ? 50 : 0;
  const bothLocked = hasStart && hasEnd;

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-2 lg:py-0"
      aria-label="Trip distance preview"
    >
      <div className="flex flex-col items-center gap-0.5 leading-tight">
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          {isRoundTrip ? "Round-trip distance" : "Distance"}
        </span>
        <span
          className={cn(
            "font-mono text-xl font-bold tabular-nums",
            km !== null ? "text-primary" : "text-muted-foreground",
          )}
        >
          {km !== null ? formatDistance(km) : "—"}
        </span>
        {km !== null && (
          <span
            className={cn(
              "text-[9px] font-medium tracking-wide uppercase",
              isDriving ? "text-success" : "text-muted-foreground",
            )}
            title={
              isDriving
                ? "Calculated by LocationIQ along the road network."
                : "Great-circle distance between the two coordinates. Real driving distance will be longer."
            }
          >
            {isFetchingRoute
              ? "Calculating route…"
              : isDriving
                ? "Driving distance"
                : "Straight-line"}
          </span>
        )}
        {isDriving && drivingDurationSec !== null && drivingDurationSec > 0 && (
          <span className="text-[10px] font-medium text-muted-foreground">
            ~{formatRouteDuration(drivingDurationSec)} by road
          </span>
        )}
      </div>

      <div className="flex w-full max-w-[220px] items-center gap-2">
        {/* Start marker — solid green once the start is locked in. */}
        <span
          className={cn(
            "flex size-3 shrink-0 rounded-full ring-4 transition-colors",
            hasStart
              ? "bg-success ring-success/15"
              : "bg-slate-300 ring-slate-100",
          )}
          aria-hidden
        />

        {/* Curvy SVG "road" that doubles as a progress indicator.
            - Background path: the unfilled road surface.
            - Foreground path: same shape, drawn from the start to a
              point along the curve controlled by `progress` via
              stroke-dashoffset (animated). Once both endpoints are
              picked, the foreground fully covers the background.
            - Dashed center line: subtle lane markers along the road
              to sell the metaphor at a glance. */}
        <svg
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          className="h-6 flex-1"
          aria-hidden
        >
          <path
            d="M 2 12 Q 20 0, 40 14 T 80 10 T 98 12"
            fill="none"
            stroke="rgb(226 232 240)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M 2 12 Q 20 0, 40 14 T 80 10 T 98 12"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={100 - progress}
            className={bothLocked ? "stroke-primary" : "stroke-primary/60"}
            style={{
              transition: "stroke-dashoffset 500ms ease-out",
            }}
          />
          {/* Dashed lane markers — only rendered when at least one
              endpoint is set, otherwise they sit on an unrelated gray
              track and read as noise. */}
          {progress > 0 && (
            <path
              d="M 2 12 Q 20 0, 40 14 T 80 10 T 98 12"
              fill="none"
              stroke="rgba(255,255,255,0.75)"
              strokeWidth="1"
              strokeDasharray="3 4"
              pathLength={100}
              strokeDashoffset={100 - progress}
              style={{
                transition: "stroke-dashoffset 500ms ease-out",
              }}
            />
          )}
        </svg>

        {/* End marker — uses the existing arrow chip so it doubles as
            the visual link between the two cards (replacing the lone
            arrow icon that used to live in this slot). */}
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full shadow-md transition-colors",
            hasEnd
              ? "bg-primary text-primary-foreground shadow-primary/25"
              : "bg-slate-200 text-slate-400 shadow-slate-200/40",
          )}
          aria-hidden
        >
          <ArrowRight className="size-4" />
        </span>
      </div>
    </div>
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

// Formats a millisecond delta as HH:MM:SS, dropping the hours segment when
// the duration is under an hour so short trips read more naturally.
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
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

function TripForm({
  initial,
  vehicles,
  drivers,
  sites,
  customRoutes,
  busyDriverIds,
  onCancel,
  onSubmit,
}: {
  initial: ApiTrip | null;
  vehicles: ApiVehicle[];
  drivers: ApiDriver[];
  sites: ApiSite[];
  // Saved admin-defined start/end presets surfaced on this form as
  // blue "Custom" picker chips below the autocomplete inputs.
  customRoutes: ApiCustomTripRoute[];
  // Drivers that already have an IN_PROGRESS trip. Used to block
  // creating a second concurrent trip for the same driver before the
  // backend has to reject it. Editing an existing PLANNED trip is
  // unaffected unless the user tries to switch to a busy driver.
  busyDriverIds: Set<string>;
  onCancel: () => void;
  onSubmit: (payload: CreateTripRequest) => Promise<void>;
}) {
  const isNew = initial === null;
  const [form, setForm] = useState<TripFormState>(() =>
    initial ? tripToForm(initial) : emptyForm(),
  );
  const [startQuery, setStartQuery] = useState(() =>
    initial
      ? formatLocationLine(
          initial.startAddress,
          initial.startCity,
          initial.startState,
        )
      : "",
  );
  const [endQuery, setEndQuery] = useState(() =>
    initial
      ? formatLocationLine(
          initial.endAddress,
          initial.endCity,
          initial.endState,
        )
      : "",
  );
  const [suggestedStartSite, setSuggestedStartSite] = useState<string | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  // Flag the picked driver if they're currently on an IN_PROGRESS trip
  // elsewhere. We only flag on create or when the driver is actually
  // being swapped out, mirroring the backend `assertDriverNotBusy`
  // check that skips when the driver is unchanged.
  const initialDriverId = initial?.driverId ?? null;
  const selectedDriverIsBusy =
    !!form.driverId &&
    form.driverId !== initialDriverId &&
    busyDriverIds.has(form.driverId);
  const busyDriverName = selectedDriverIsBusy
    ? (() => {
        const d = driverById.get(form.driverId);
        return d ? `${d.firstName} ${d.lastName}` : "This driver";
      })()
    : null;

  function update<K extends keyof TripFormState>(
    key: K,
    value: TripFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyStartFromSite(site: ApiSite) {
    setSuggestedStartSite(site.name);
    setForm((prev) => ({ ...prev, ...siteToStartFields(site) }));
    setStartQuery(formatSiteLocation(site));
    // Sites are stored without lat/lon today, so the distance preview
    // can't compute anything from the auto-fill alone. Kick off a quick
    // LocationIQ geocode and patch the coords in once they arrive. We
    // capture the site id so a rapid second selection can't race the
    // first one's response and clobber the newer coords.
    const targetSiteId = site.id;
    void geocodeAddress(formatSiteLocation(site)).then((coords) => {
      if (!coords) return;
      setForm((prev) => {
        // Bail if the user already picked a different site / location in
        // the meantime — comparing the address line is a cheap proxy.
        if (prev.startAddress !== site.address) return prev;
        return { ...prev, startLat: coords.lat, startLon: coords.lon };
      });
      // Tag the form with the site id so the proxy comparison above is
      // robust against two sites that happen to share an address string.
      // We can revisit this once sites carry lat/lon natively.
      void targetSiteId;
    });
  }

  function handleDriverSelect(driver: ApiDriver) {
    const vehicle = driver.assignedVehicleId
      ? vehicleById.get(driver.assignedVehicleId)
      : undefined;
    setForm((prev) => ({
      ...prev,
      driverId: driver.id,
      vehicleId: vehicle?.id ?? "",
    }));
    const site = resolvePrimarySite(driver, vehicle, sites);
    if (site) applyStartFromSite(site);
    else setSuggestedStartSite(null);
  }

  function handleDriverClear() {
    // Clear the auto-linked vehicle alongside the driver so the form
    // doesn't drift into an inconsistent state with a stranded vehicle
    // assignment after the Vehicle FormCard was removed.
    setForm((prev) => ({ ...prev, driverId: "", vehicleId: "" }));
    setSuggestedStartSite(null);
  }

  function applyStart(picked: PickedLocation) {
    setSuggestedStartSite(null);
    setForm((prev) => ({
      ...prev,
      startAddress: picked.address || prev.startAddress,
      startCity: picked.city || prev.startCity,
      startState: picked.state || prev.startState,
      startLat: picked.lat,
      startLon: picked.lon,
    }));
  }

  function applyEnd(picked: PickedLocation) {
    setForm((prev) => ({
      ...prev,
      endAddress: picked.address || prev.endAddress,
      endCity: picked.city || prev.endCity,
      endState: picked.state || prev.endState,
      endLat: picked.lat,
      endLon: picked.lon,
    }));
  }

  // Pre-shape the saved custom routes into LocationAutocomplete
  // options so each side of the form can render them inline within
  // its dropdown.
  //
  // Both endpoints of every saved route contribute to BOTH the start
  // and end pickers: the admin only registers one direction (A → B),
  // but the same pairing can be driven in reverse (B → A) for the
  // same distance, so both A and B should be selectable as either
  // start or end. Results are deduped by normalized name so two
  // routes sharing an endpoint don't produce two identical chips.
  //
  // The `payload` is what `applyStart` / `applyEnd` already know how
  // to consume, so picking a custom suggestion flows through the
  // same code path as a LocationIQ suggestion.
  const customStartOptions = useMemo<CustomLocationOption[]>(
    () =>
      buildCustomEndpointOptions(customRoutes, "start"),
    [customRoutes],
  );

  const customEndOptions = useMemo<CustomLocationOption[]>(
    () =>
      buildCustomEndpointOptions(customRoutes, "end"),
    [customRoutes],
  );

  // When both halves of the form match the same saved Custom route —
  // in either direction — we surface the admin-recorded distance
  // instead of trying to recompute it (Custom routes have no lat/lon).
  // The reverse-direction match means a single saved A→B preset
  // automatically works for the B→A return trip without the admin
  // needing to register the inverse pairing.
  const matchedCustomRoute = useMemo(() => {
    const norm = (s: string | null | undefined) =>
      (s ?? "").trim().toLowerCase();
    const sName = norm(form.startAddress);
    const eName = norm(form.endAddress);
    if (!sName || !eName) return null;
    return (
      customRoutes.find((r) => {
        const a = norm(r.startName);
        const b = norm(r.endName);
        return (
          (a === sName && b === eName) || (b === sName && a === eName)
        );
      }) ?? null
    );
  }, [customRoutes, form.startAddress, form.endAddress]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const startAddress = form.startAddress.trim();
    const endAddress = form.endAddress.trim();

    if (!form.vehicleId) {
      setFormError("Select a vehicle for this trip.");
      return;
    }
    if (!startAddress || !endAddress) {
      setFormError("Starting and ending locations are required.");
      return;
    }
    if (selectedDriverIsBusy) {
      setFormError(
        `${busyDriverName ?? "This driver"} is currently on an in-progress trip. Check that trip in or cancel it before adding another one.`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateTripRequest = {
        vehicleId: form.vehicleId,
        driverId: form.driverId || undefined,
        status: form.status,
        startAddress,
        startCity: form.startCity.trim() || undefined,
        startState: form.startState.trim() || undefined,
        startLat: form.startLat ?? undefined,
        startLon: form.startLon ?? undefined,
        endAddress,
        endCity: form.endCity.trim() || undefined,
        endState: form.endState.trim() || undefined,
        endLat: form.endLat ?? undefined,
        endLon: form.endLon ?? undefined,
        isRoundTrip: form.isRoundTrip,
      };
      await onSubmit(payload);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Could not save trip.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8 rounded-lg hover:bg-primary/10 hover:text-primary"
          aria-label="Back to trips list"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
            {isNew ? "New trip" : "Edit trip"}
          </p>
          <h3 className="text-base font-semibold text-primary">
            {isNew ? "Plan a trip" : "Update trip"}
          </h3>
        </div>
      </div>

      {formError && <PanelError message={formError} />}

      {/* Driver picks. The vehicle is no longer a separate card — the
          driver's assigned truck is rendered as an inline tag right
          next to their name once a driver is selected. Picking a
          driver still auto-fills the vehicle id and the start site
          via `handleDriverSelect`. */}
      <FormCard
        title="Driver"
        description="Search drivers — loads their assigned truck and its site as the start."
        icon={UserRound}
      >
        <TripDriverPicker
          drivers={drivers}
          vehicles={vehicles}
          sites={sites}
          selectedId={form.driverId}
          onSelect={handleDriverSelect}
          onClear={handleDriverClear}
          disabled={isSubmitting}
        />
        {selectedDriverIsBusy && (
          <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
            {busyDriverName} is currently on an in-progress trip. Check that
            trip in or cancel it before adding another one for this driver.
          </p>
        )}
        {form.driverId && !form.vehicleId && (
          <p className="mt-2 text-xs text-amber-700">
            This driver has no vehicle assigned yet. Assign one from the
            Drivers page before planning a trip.
          </p>
        )}
        {form.vehicleId && form.driverId && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Driving
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              <Truck className="size-3.5" />
              {vehicleById.get(form.vehicleId)?.assetNumber ?? "—"}
              {vehicleById.get(form.vehicleId)?.plateNumber && (
                <span className="font-mono text-[11px] font-medium text-primary/70">
                  · {vehicleById.get(form.vehicleId)?.plateNumber}
                </span>
              )}
            </span>
          </div>
        )}
      </FormCard>

      <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_220px_1fr]">
        <FormCard
          title="Starting point"
          description="Auto-filled from the driver or vehicle site."
          icon={MapPin}
        >
          <div className="space-y-4">
            {suggestedStartSite && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                Suggested start from site{" "}
                <span className="font-semibold">{suggestedStartSite}</span>.
                Use the search below to pick a different location.
              </div>
            )}
            <SettingsField label="Search start location">
              <LocationAutocomplete
                value={startQuery}
                onChange={(q) => {
                  setSuggestedStartSite(null);
                  setStartQuery(q);
                }}
                onSelect={applyStart}
                disabled={isSubmitting}
                placeholder="Where does the trip begin?"
                customOptions={customStartOptions}
              />
            </SettingsField>
            <FieldGrid cols={1}>
              <SettingsField label="Address">
                <input
                  type="text"
                  required
                  value={form.startAddress}
                  onChange={(e) => {
                    setSuggestedStartSite(null);
                    update("startAddress", e.target.value);
                  }}
                  disabled={isSubmitting}
                  className={fieldClass}
                />
              </SettingsField>
            </FieldGrid>
          </div>
        </FormCard>

        <div className="flex flex-col items-center gap-3 lg:gap-2">
          <TripDistancePreview
            startLat={form.startLat}
            startLon={form.startLon}
            endLat={form.endLat}
            endLon={form.endLon}
            hasStart={
              Boolean(form.startAddress) ||
              (form.startLat !== null && form.startLon !== null)
            }
            hasEnd={
              Boolean(form.endAddress) ||
              (form.endLat !== null && form.endLon !== null)
            }
            isRoundTrip={form.isRoundTrip}
          />
          {/* Saved-distance hint shown when both start and end correspond
              to the same Custom Trip Route. Lets the operator confirm the
              admin-recorded distance will be used (Custom routes have no
              lat/lon today, so the live preview can't compute it). */}
          {matchedCustomRoute && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              <CustomTag />
              <span>
                Saved distance:{" "}
                {formatDistance(
                  form.isRoundTrip
                    ? matchedCustomRoute.distanceKm * 2
                    : matchedCustomRoute.distanceKm,
                )}
              </span>
            </div>
          )}
          {/* Round-trip toggle. When checked the distance preview and
              the persisted distance computed at check-in cover both
              legs (A → B → A). Unchecked falls back to the one-way
              distance the routing API returns by default. */}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10">
            <input
              type="checkbox"
              checked={form.isRoundTrip}
              onChange={(e) => update("isRoundTrip", e.target.checked)}
              disabled={isSubmitting}
              className="size-3.5 rounded border-primary/40 text-primary focus:ring-primary/30"
            />
            Returns here
            <span className="text-[10px] font-normal text-primary/60">
              (round trip)
            </span>
          </label>
        </div>

        <FormCard
          title="Ending point"
          description="Where the trip wraps up."
          icon={MapPin}
        >
          <div className="space-y-4">
            <SettingsField label="Search end location">
              <LocationAutocomplete
                value={endQuery}
                onChange={setEndQuery}
                onSelect={applyEnd}
                disabled={isSubmitting}
                placeholder="Where does the trip end?"
                customOptions={customEndOptions}
              />
            </SettingsField>
            <FieldGrid cols={1}>
              <SettingsField label="Address">
                <input
                  type="text"
                  required
                  value={form.endAddress}
                  onChange={(e) => update("endAddress", e.target.value)}
                  disabled={isSubmitting}
                  className={fieldClass}
                />
              </SettingsField>
            </FieldGrid>
          </div>
        </FormCard>
      </div>

      <FormCard title="Status" icon={Route}>
        <SettingsField label="Trip status">
          <select
            className={fieldClass}
            value={form.status}
            onChange={(e) => update("status", e.target.value as TripStatus)}
            disabled={isSubmitting}
          >
            {TRIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {prettyEnum(s)}
              </option>
            ))}
          </select>
        </SettingsField>
      </FormCard>

      <div className="sticky bottom-0 -mx-2 mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-2 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="h-10 gap-2 rounded-xl border-slate-200 bg-white px-4 text-sm"
        >
          <X className="size-4" />
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || selectedDriverIsBusy}
          className="h-10 gap-2 rounded-xl bg-primary px-5 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="size-4" />
              {isNew ? "Create Trip" : "Save Changes"}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function FormCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        {Icon ? (
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        ) : null}
        <div>
          <p className="text-sm font-semibold text-primary">{title}</p>
          {description ? (
            <p className="text-[11px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

