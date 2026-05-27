"use client";

import {
  ArrowLeft,
  ArrowRight,
  Filter,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Route,
  Save,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
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
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PanelError } from "@/components/vehicles/VehicleForm";
import { ApiError } from "@/lib/api/client";
import { listDrivers } from "@/lib/api/drivers";
import {
  createTrip,
  deleteTrip,
  listTrips,
  updateTrip,
  type CreateTripRequest,
} from "@/lib/api/trips";
import {
  TRIP_STATUSES,
  prettyEnum,
  type ApiDriver,
  type ApiTrip,
  type ApiVehicle,
  type TripStatus,
} from "@/lib/api/types";
import { listVehicles } from "@/lib/api/vehicles";
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
  scheduledAt: string;
  notes: string;
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
    scheduledAt: "",
    notes: "",
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
    scheduledAt: trip.scheduledAt
      ? toDatetimeLocalValue(trip.scheduledAt)
      : "",
    notes: trip.notes ?? "",
  };
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [statusFilter, setStatusFilter] = useState<TripStatus | "ALL">("ALL");
  const [vehicleFilter, setVehicleFilter] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ApiTrip | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [t, v, d] = await Promise.all([
        listTrips(),
        listVehicles(),
        listDrivers().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiDriver[];
          throw err;
        }),
      ]);
      setTrips(t);
      setVehicles(v);
      setDrivers(d);
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

  if (mode.kind === "create" || mode.kind === "edit") {
    const editing = mode.kind === "edit" ? mode.trip : null;
    return (
      <TripForm
        initial={editing}
        vehicles={vehicles}
        drivers={drivers}
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
}: {
  trip: ApiTrip;
  vehicle: ApiVehicle | null;
  driver: ApiDriver | null;
  density: "comfortable" | "compact";
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 transition-colors hover:border-primary/30 hover:bg-white",
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
          {trip.scheduledAt && (
            <span>
              Scheduled{" "}
              <span className="font-semibold text-primary">
                {new Date(trip.scheduledAt).toLocaleString()}
              </span>
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit trip"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete trip"
          className="flex size-8 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/10"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
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
  onCancel,
  onSubmit,
}: {
  initial: ApiTrip | null;
  vehicles: ApiVehicle[];
  drivers: ApiDriver[];
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const activeDrivers = useMemo(
    () => drivers.filter((d) => d.status === "ACTIVE"),
    [drivers],
  );

  function update<K extends keyof TripFormState>(
    key: K,
    value: TripFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyStart(picked: PickedLocation) {
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
        scheduledAt: form.scheduledAt
          ? new Date(form.scheduledAt).toISOString()
          : undefined,
        notes: form.notes.trim() || undefined,
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
        title="Vehicle & driver"
        description="Choose a registered vehicle and optionally assign a driver."
        icon={Truck}
      >
        <FieldGrid>
          <SettingsField label="Vehicle">
            <select
              className={fieldClass}
              required
              value={form.vehicleId}
              onChange={(e) => update("vehicleId", e.target.value)}
              disabled={isSubmitting}
            >
              <option value="">Select vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.assetNumber ?? v.plateNumber} — {v.plateNumber} (
                  {prettyEnum(v.type)})
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField label="Driver (optional)">
            <select
              className={fieldClass}
              value={form.driverId}
              onChange={(e) => update("driverId", e.target.value)}
              disabled={isSubmitting}
            >
              <option value="">No driver assigned</option>
              {activeDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.firstName} {d.lastName} ({d.employeeId})
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField label="Status">
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
          <SettingsField label="Scheduled (optional)">
            <input
              type="datetime-local"
              className={fieldClass}
              value={form.scheduledAt}
              onChange={(e) => update("scheduledAt", e.target.value)}
              disabled={isSubmitting}
            />
          </SettingsField>
        </FieldGrid>
      </FormCard>

      <FormCard
        title="Starting point"
        description="Search for the departure location."
        icon={MapPin}
      >
        <div className="space-y-4">
          <SettingsField label="Search start location">
            <LocationAutocomplete
              value={startQuery}
              onChange={setStartQuery}
              onSelect={applyStart}
              disabled={isSubmitting}
              placeholder="Where does the trip begin?"
            />
          </SettingsField>
          <FieldGrid>
            <SettingsField label="Address">
              <input
                type="text"
                required
                value={form.startAddress}
                onChange={(e) => update("startAddress", e.target.value)}
                disabled={isSubmitting}
                className={fieldClass}
              />
            </SettingsField>
            <SettingsField label="City">
              <input
                type="text"
                value={form.startCity}
                onChange={(e) => update("startCity", e.target.value)}
                disabled={isSubmitting}
                className={fieldClass}
              />
            </SettingsField>
            <SettingsField label="State">
              <input
                type="text"
                value={form.startState}
                onChange={(e) => update("startState", e.target.value)}
                disabled={isSubmitting}
                className={fieldClass}
              />
            </SettingsField>
          </FieldGrid>
        </div>
      </FormCard>

      <FormCard
        title="Ending point"
        description="Search for the destination."
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
          <FieldGrid>
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
          </FieldGrid>
        </div>
      </FormCard>

      <FormCard title="Notes" icon={Route}>
        <SettingsField label="Trip notes (optional)">
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            disabled={isSubmitting}
            rows={3}
            placeholder="Cargo details, route instructions, etc."
            className={cn(
              fieldClass,
              "h-auto min-h-[5rem] resize-y py-2.5",
            )}
          />
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
