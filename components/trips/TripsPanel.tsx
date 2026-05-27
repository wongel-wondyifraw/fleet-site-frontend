"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Ban,
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
  Timer,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";
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

import {
  FieldGrid,
  SettingsField,
  fieldClass,
} from "@/components/settings/SettingsShared";
import {
  LocationAutocomplete,
  type PickedLocation,
} from "@/components/shared/LocationAutocomplete";
import { TripDriverPicker } from "@/components/trips/TripDriverPicker";
import { TripVehiclePicker } from "@/components/trips/TripVehiclePicker";
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
import { listSites } from "@/lib/api/sites";
import {
  TRIP_STATUSES,
  prettyEnum,
  type ApiDriver,
  type ApiSite,
  type ApiTrip,
  type ApiVehicle,
  type TripDriverSummary,
  type TripStatus,
  type TripVehicleSummary,
} from "@/lib/api/types";
import { listVehicles } from "@/lib/api/vehicles";
import {
  findDriverForVehicle,
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
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [statusFilter, setStatusFilter] = useState<TripStatus | "ALL">("ALL");
  const [vehicleFilter, setVehicleFilter] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ApiTrip | null>(null);
  // Trip queued for cancel confirmation. Kept separate from delete because
  // cancel is reversible-ish (the row keeps a CANCELLED record) so we don't
  // want to share the destructive copy.
  const [pendingCancel, setPendingCancel] = useState<ApiTrip | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [t, v, d, s] = await Promise.all([
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
      ]);
      setTrips(t);
      setVehicles(v);
      setDrivers(d);
      setSites(s);
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

  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (vehicleFilter !== "ALL" && t.vehicleId !== vehicleFilter) return false;
      return true;
    });
  }, [trips, statusFilter, vehicleFilter]);

  async function handleCreate(payload: CreateTripRequest): Promise<void> {
    await createTrip(payload);
    setMode({ kind: "list" });
    await refresh();
  }

  async function handleUpdate(
    id: string,
    payload: CreateTripRequest,
  ): Promise<void> {
    await updateTrip(id, payload);
    setMode({ kind: "list" });
    await refresh();
  }

  async function handleConfirmedDelete(target: ApiTrip): Promise<void> {
    try {
      await deleteTrip(target.id);
      await refresh();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to delete trip.",
      );
    }
  }

  // Drives the Trip Checkout / Check-in / Cancel buttons. Refresh after
  // each transition so the row picks up the new status, timestamps, and
  // the next set of available actions in one round-trip.
  async function handleStatusChange(
    target: ApiTrip,
    next: TripStatus,
  ): Promise<void> {
    try {
      await setTripStatus(target.id, next);
      await refresh();
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "Unable to update trip status.",
      );
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-primary">
              {filteredTrips.length}
            </span>{" "}
            of {trips.length} {trips.length === 1 ? "trip" : "trips"} shown
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <div className="relative w-full sm:w-44">
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
            <div className="relative w-full sm:w-56">
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
          </div>
        </div>
        <Button
          onClick={() => setMode({ kind: "create" })}
          disabled={vehicles.length === 0}
          className="h-10 gap-2 self-start rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint sm:self-auto"
        >
          <Plus className="size-4" />
          Create Trip
        </Button>
      </div>

      {vehicles.length === 0 && !isLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-800">
          Register at least one vehicle before creating trips.
        </div>
      )}

      {loadError && <PanelError message={loadError} />}

      {isLoading ? (
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
              No trips match your filters.
            </p>
            {(statusFilter !== "ALL" || vehicleFilter !== "ALL") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter("ALL");
                  setVehicleFilter("ALL");
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
          {filteredTrips.map((trip) => (
            <TripRow
              key={trip.id}
              trip={trip}
              vehicle={
                trip.vehicle ??
                vehicleById.get(trip.vehicleId) ??
                null
              }
              driver={
                trip.driverId
                  ? (trip.driver ??
                      driverById.get(trip.driverId) ??
                      null)
                  : null
              }
              density={density}
              onEdit={() => setMode({ kind: "edit", trip })}
              onDelete={() => setPendingDelete(trip)}
              onRequestCancel={() => setPendingCancel(trip)}
              onStatusChange={(next) => handleStatusChange(trip, next)}
            />
          ))}
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

function TripRow({
  trip,
  vehicle,
  driver,
  density,
  onEdit,
  onDelete,
  onRequestCancel,
  onStatusChange,
}: {
  trip: ApiTrip;
  // Accept the slim summary so we can render whichever shape the trip
  // payload provides (nested on list responses) or the full ApiVehicle we
  // looked up locally — TripRow only needs the asset / plate fields.
  vehicle: TripVehicleSummary | ApiVehicle | null;
  driver: TripDriverSummary | ApiDriver | null;
  density: "comfortable" | "compact";
  onEdit: () => void;
  onDelete: () => void;
  // Opens the cancel-confirmation dialog. The actual status transition
  // runs from the panel after the user confirms.
  onRequestCancel: () => void;
  onStatusChange: (next: TripStatus) => Promise<void> | void;
}) {
  // Tracks the in-flight status action so we can disable all three buttons
  // while a request is in progress and surface a spinner on the clicked one.
  const [pendingAction, setPendingAction] = useState<TripStatus | null>(null);
  const isBusy = pendingAction !== null;

  async function runAction(next: TripStatus) {
    setPendingAction(next);
    try {
      await onStatusChange(next);
    } finally {
      setPendingAction(null);
    }
  }

  const startedAtMs = trip.startedAt ? Date.parse(trip.startedAt) : null;
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

  const canCheckout = trip.status === "PLANNED";
  const canCheckin = trip.status === "IN_PROGRESS";
  const canCancel =
    trip.status === "PLANNED" || trip.status === "IN_PROGRESS";

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
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-primary">
            {vehicle
              ? `${vehicle.assetNumber ?? vehicle.plateNumber} · ${vehicle.plateNumber}`
              : "Unknown vehicle"}
          </p>
          <TripStatusPill status={trip.status} />
          {trip.status === "IN_PROGRESS" && elapsedMs !== null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide text-amber-800 tabular-nums">
              <Timer className="size-3 animate-pulse" />
              {formatDuration(elapsedMs)}
            </span>
          )}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <MapPin className="size-3 shrink-0 text-primary" />
          <span className="truncate font-medium text-primary">
            {formatLocationLine(
              trip.startAddress,
              trip.startCity,
              trip.startState,
            )}
          </span>
          <ArrowRight className="size-3 shrink-0" />
          <span className="truncate font-medium text-primary">
            {formatLocationLine(
              trip.endAddress,
              trip.endCity,
              trip.endState,
            )}
          </span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {driver && (
            <span className="inline-flex items-center gap-1">
              <UserRound className="size-3" />
              <span className="font-semibold text-primary">
                {driver.firstName} {driver.lastName}
              </span>
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
                {new Date(trip.startedAt).toLocaleString()}
              </span>
            </span>
          )}
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
        {trip.status === "COMPLETED" && (
          <TripCompletedStats
            durationMs={elapsedMs}
            distanceKm={getTripDistanceKm(trip)}
            startedAt={trip.startedAt}
            completedAt={trip.completedAt}
          />
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
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            disabled={isBusy}
            aria-label="Edit trip"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isBusy}
            aria-label="Delete trip"
            className="flex size-8 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
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
  tone: "success" | "primary" | "muted";
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
  startedAt,
  completedAt,
}: {
  durationMs: number | null;
  distanceKm: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
}) {
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
        // TODO: replace with measured route distance once GPS tracking
        // ships. For now this is the straight-line distance between the
        // saved start/end coordinates (LocationIQ-picked) or a placeholder.
        value={distanceKm !== null ? formatDistance(distanceKm) : "—"}
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

  const checkedOut = startedAt ? new Date(startedAt).toLocaleString() : "—";
  const checkedIn = completedAt ? new Date(completedAt).toLocaleString() : "—";

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

// Resolves a "distance" to render for a trip. Prefers the haversine
// straight-line between saved start/end coordinates so trips picked from
// LocationIQ show a real number; falls back to null so the stats cell can
// render a placeholder. Replace this once real route tracking is wired up.
function getTripDistanceKm(trip: ApiTrip): number | null {
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
  onCancel,
  onSubmit,
}: {
  initial: ApiTrip | null;
  vehicles: ApiVehicle[];
  drivers: ApiDriver[];
  sites: ApiSite[];
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
  }

  function handleVehicleSelect(vehicle: ApiVehicle) {
    const linkedDriver = findDriverForVehicle(drivers, vehicle.id);
    setForm((prev) => ({
      ...prev,
      vehicleId: vehicle.id,
      driverId: linkedDriver?.id ?? "",
    }));
    const site = resolvePrimarySite(linkedDriver, vehicle, sites);
    if (site) applyStartFromSite(site);
    else setSuggestedStartSite(null);
  }

  function handleVehicleClear() {
    setForm((prev) => ({ ...prev, vehicleId: "", driverId: "" }));
    setSuggestedStartSite(null);
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
    update("driverId", "");
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

      <FormCard
        title="Driver"
        description="Search drivers — loads their truck and home site as the start."
        icon={UserRound}
      >
        <TripDriverPicker
          drivers={drivers}
          sites={sites}
          selectedId={form.driverId}
          onSelect={handleDriverSelect}
          onClear={handleDriverClear}
          disabled={isSubmitting}
        />
        {form.driverId && !form.vehicleId && (
          <p className="mt-2 text-xs text-amber-700">
            This driver has no vehicle assigned yet. Pick a vehicle below or
            assign one from Drivers.
          </p>
        )}
        {form.vehicleId && form.driverId && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Linked:{" "}
            <span className="font-semibold text-primary">
              {driverById.get(form.driverId)?.firstName}{" "}
              {driverById.get(form.driverId)?.lastName}
            </span>
            {" · "}
            <span className="font-semibold text-primary">
              {vehicleById.get(form.vehicleId)?.assetNumber ??
                vehicleById.get(form.vehicleId)?.plateNumber}
            </span>
          </p>
        )}
      </FormCard>

      <FormCard
        title="Vehicle"
        description="Pick a truck — loads its driver and assigned site as the start."
        icon={Truck}
      >
        <TripVehiclePicker
          vehicles={vehicles}
          sites={sites}
          selectedId={form.vehicleId}
          onSelect={handleVehicleSelect}
          onClear={handleVehicleClear}
          disabled={isSubmitting}
        />
      </FormCard>

      <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
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
              <div className="grid grid-cols-2 gap-3">
                <SettingsField label="City">
                  <input
                    type="text"
                    value={form.startCity}
                    onChange={(e) => {
                      setSuggestedStartSite(null);
                      update("startCity", e.target.value);
                    }}
                    disabled={isSubmitting}
                    className={fieldClass}
                  />
                </SettingsField>
                <SettingsField label="State">
                  <input
                    type="text"
                    value={form.startState}
                    onChange={(e) => {
                      setSuggestedStartSite(null);
                      update("startState", e.target.value);
                    }}
                    disabled={isSubmitting}
                    className={fieldClass}
                  />
                </SettingsField>
              </div>
            </FieldGrid>
          </div>
        </FormCard>

        <div
          className="flex items-center justify-center lg:px-1"
          aria-hidden="true"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25">
            <ArrowRight className="hidden size-5 lg:block" />
            <ArrowDown className="size-5 lg:hidden" />
          </span>
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
              <div className="grid grid-cols-2 gap-3">
                <SettingsField label="City">
                  <input
                    type="text"
                    value={form.endCity}
                    onChange={(e) => update("endCity", e.target.value)}
                    disabled={isSubmitting}
                    className={fieldClass}
                  />
                </SettingsField>
                <SettingsField label="State">
                  <input
                    type="text"
                    value={form.endState}
                    onChange={(e) => update("endState", e.target.value)}
                    disabled={isSubmitting}
                    className={fieldClass}
                  />
                </SettingsField>
              </div>
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
          disabled={isSubmitting}
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
