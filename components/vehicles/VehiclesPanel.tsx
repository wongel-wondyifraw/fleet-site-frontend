"use client";

// Vehicle Registry list panel - search + filter + add-new flow. Clicking a
// row routes to the dedicated detail page where edit and delete live.
import {
  ChevronRight,
  Filter,
  Gauge,
  Loader2,
  MapPin,
  Plus,
  Search,
  Trash2,
  Truck,
  User as UserIcon,
} from "@/lib/icons";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";

import { fieldClass } from "@/components/settings/SettingsShared";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  PanelError,
  VehicleForm,
  type DriverSelection,
} from "@/components/vehicles/VehicleForm";
import { saveVehicleWithDriver } from "@/components/vehicles/saveVehicle";
import { Pagination } from "@/components/ui/Pagination";
import { ApiError } from "@/lib/api/client";
import { listDrivers } from "@/lib/api/drivers";
import { listSites } from "@/lib/api/sites";
import { useCursorPagedList } from "@/lib/api/useCursorPagedList";
import {
  VEHICLE_TYPES,
  prettyEnum,
  type ApiDriver,
  type ApiSite,
  type ApiVehicle,
  type VehicleStatus,
  type VehicleType,
} from "@/lib/api/types";
import {
  deleteVehicle,
  listVehiclesPage,
  type CreateVehicleRequest,
} from "@/lib/api/vehicles";
import { staggerStyle } from "@/lib/animations";
import { cn } from "@/lib/utils";

// Tailwind color tokens for the vehicle status pill, kept in one place so
// status colors stay consistent everywhere they're rendered.
const VEHICLE_STATUS_PILL: Record<VehicleStatus, string> = {
  ACTIVE: "bg-success/15 text-success",
  IDLE: "bg-blue-50 text-blue-700",
  IN_MAINTENANCE: "bg-amber-50 text-amber-700",
  OUT_OF_SERVICE: "bg-destructive/15 text-destructive",
  RETIRED: "bg-slate-200 text-slate-700",
};

// View modes: list (default) or add-new form. Edits happen on the detail page.
type Mode = { kind: "list" } | { kind: "form" };

export function VehiclesPanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  const [drivers, setDrivers] = useState<ApiDriver[]>([]);
  const [sites, setSites] = useState<ApiSite[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [searchQuery, setSearchQuery] = useState("");
  // "ALL" means no filter; otherwise narrow the list to a single vehicle type.
  const [typeFilter, setTypeFilter] = useState<VehicleType | "ALL">("ALL");
  const [auxLoading, setAuxLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Vehicle pending a delete confirmation. `null` keeps the dialog closed;
  // setting it opens the dialog and seeds its title/description.
  const [pendingDelete, setPendingDelete] = useState<ApiVehicle | null>(null);

  const vehicleList = useCursorPagedList({
    fetchPage: (cursor, limit) =>
      listVehiclesPage({
        type: typeFilter === "ALL" ? undefined : typeFilter,
        cursor,
        limit,
      }),
    deps: [typeFilter],
  });

  const refreshAux = useCallback(async () => {
    setAuxLoading(true);
    setLoadError(null);
    try {
      const [d, s] = await Promise.all([
        listDrivers().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiDriver[];
          throw err;
        }),
        listSites().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiSite[];
          throw err;
        }),
      ]);
      setDrivers(d);
      setSites(s);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load vehicles.",
      );
    } finally {
      setAuxLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAux();
  }, [refreshAux]);

  useEffect(() => {
    if (vehicleList.error) {
      setLoadError(vehicleList.error.message);
    }
  }, [vehicleList.error]);

  const refresh = useCallback(async () => {
    await Promise.all([vehicleList.reload(), refreshAux()]);
  }, [vehicleList, refreshAux]);

  // O(1) lookups for the row metadata.
  const siteById = useMemo(() => {
    const map = new Map<string, ApiSite>();
    for (const s of sites) map.set(s.id, s);
    return map;
  }, [sites]);

  const driverByVehicleId = useMemo(() => {
    const map = new Map<string, ApiDriver>();
    for (const d of drivers) {
      if (d.assignedVehicleId) map.set(d.assignedVehicleId, d);
    }
    return map;
  }, [drivers]);

  // Free-text search on the current page (backend has no vehicle search param).
  const filteredVehicles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return vehicleList.items;
    return vehicleList.items.filter((v) => {
      const driver = driverByVehicleId.get(v.id);
      const site = v.assignedSite ? siteById.get(v.assignedSite) : null;
      const hay = [
        v.assetNumber,
        v.plateNumber,
        prettyEnum(v.type),
        driver ? `${driver.firstName} ${driver.lastName}` : "",
        site?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [vehicleList.items, driverByVehicleId, siteById, searchQuery]);

  const isLoading = auxLoading || vehicleList.isLoading;

  // Create handler - delegates the multi-step save to the shared helper.
  async function handleCreate(args: {
    payload: CreateVehicleRequest;
    status: VehicleStatus | null;
    driverSelection: DriverSelection;
  }): Promise<void> {
    await saveVehicleWithDriver({
      payload: args.payload,
      status: args.status,
      driverSelection: args.driverSelection,
      editingVehicleId: null,
      previousDriverId: null,
    });
    setMode({ kind: "list" });
    await refresh();
  }

  // Runs after the confirmation dialog resolves. The dialog handles the
  // confirm UX (label, spinner, escape-to-cancel); we just do the API call.
  async function handleConfirmedDelete(target: ApiVehicle): Promise<void> {
    try {
      await deleteVehicle(target.id);
      await refresh();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to delete vehicle.",
      );
    }
  }

  // ---- Form view (add new only) -------------------------------------------
  if (mode.kind === "form") {
    return (
      <VehicleForm
        initial={null}
        initialDriver={null}
        sites={sites}
        drivers={drivers}
        onCancel={() => setMode({ kind: "list" })}
        onSubmit={handleCreate}
      />
    );
  }

  // ---- List view ----------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-primary">
              {filteredVehicles.length}
            </span>{" "}
            on this page
            {vehicleList.isLastPageReached && vehicleList.totalPages !== undefined
              ? ` · ${vehicleList.totalPages} page${vehicleList.totalPages === 1 ? "" : "s"} total`
              : null}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search asset, plate, driver, or site"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${fieldClass} pl-9`}
                aria-label="Search vehicles"
              />
            </div>
            <div className="w-full sm:w-52">
              <Select
                value={typeFilter}
                onValueChange={(v) =>
                  setTypeFilter(v as VehicleType | "ALL")
                }
                leftIcon={Filter}
                aria-label="Filter by vehicle type"
                options={[
                  { value: "ALL", label: "All types" },
                  ...VEHICLE_TYPES.map((t) => ({
                    value: t,
                    label: prettyEnum(t),
                  })),
                ]}
              />
            </div>
          </div>
        </div>
        <Button
          onClick={() => setMode({ kind: "form" })}
          className="h-10 gap-2 self-start rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint sm:self-auto"
        >
          <Plus className="size-4" />
          Add Vehicle
        </Button>
      </div>

      {loadError && <PanelError message={loadError} />}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : filteredVehicles.length === 0 ? (
        vehicleList.items.length === 0 && !searchQuery.trim() ? (
          <EmptyState />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
            <Truck className="mx-auto mb-2 size-6 text-muted-foreground" />
            <p className="text-sm font-medium text-primary">
              No vehicles match your filters.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {typeFilter === "ALL"
                ? "Try a different asset number, plate, driver, or site."
                : `No ${prettyEnum(typeFilter)} vehicles match — try clearing the type filter.`}
            </p>
            {typeFilter !== "ALL" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTypeFilter("ALL")}
                className="mt-3 h-8 gap-1 rounded-lg border-slate-200 bg-white px-3 text-xs"
              >
                Clear type filter
              </Button>
            )}
          </div>
        )
      ) : (
        <div className="space-y-2 fs-content-fade">
          {filteredVehicles.map((vehicle, index) => (
            <div
              key={vehicle.id}
              className="fs-row-in"
              style={staggerStyle(index)}
            >
            <VehicleRow
              vehicle={vehicle}
              driver={driverByVehicleId.get(vehicle.id) ?? null}
              site={
                vehicle.assignedSite
                  ? (siteById.get(vehicle.assignedSite) ?? null)
                  : null
              }
              density={density}
              onDelete={() => setPendingDelete(vehicle)}
            />
            </div>
          ))}
          <Pagination
            page={vehicleList.page}
            pageSize={vehicleList.pageSize}
            highestKnownPage={vehicleList.highestKnownPage}
            totalPages={vehicleList.totalPages}
            isLastPageReached={vehicleList.isLastPageReached}
            isLoading={vehicleList.isLoading}
            onPageChange={(p) => void vehicleList.goToPage(p)}
            onPageSizeChange={vehicleList.setPageSize}
          />
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete vehicle?"
        description={
          pendingDelete ? (
            <>
              You&apos;re about to permanently delete{" "}
              <span className="font-mono font-semibold text-primary">
                {pendingDelete.assetNumber}
              </span>{" "}
              ({pendingDelete.plateNumber}). This action cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete vehicle"
        destructive
        onConfirm={async () => {
          if (pendingDelete) await handleConfirmedDelete(pendingDelete);
        }}
      />
    </div>
  );
}

// Each list entry is a Link to the detail page. The whole row is clickable;
// the trailing delete button stops propagation so it doesn't navigate.
function VehicleRow({
  vehicle,
  driver,
  site,
  density,
  onDelete,
}: {
  vehicle: ApiVehicle;
  driver: ApiDriver | null;
  site: ApiSite | null;
  density: "comfortable" | "compact";
  onDelete: () => void;
}) {
  function handleDeleteClick(e: MouseEvent<HTMLButtonElement>) {
    // Prevent the parent Link from intercepting the click.
    e.preventDefault();
    e.stopPropagation();
    onDelete();
  }

  return (
    <Link
      href={`/dashboard/vehicles/${vehicle.id}`}
      className={cn(
        "group flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 transition-colors hover:border-primary/30 hover:bg-white focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        density === "compact" ? "p-3" : "p-4",
      )}
      aria-label={`Open ${vehicle.assetNumber} details`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Truck className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-mono text-sm font-semibold text-primary">
            {vehicle.assetNumber}
          </p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
            {vehicle.plateNumber}
          </span>
          <VehicleStatusPill status={vehicle.status} />
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
            {prettyEnum(vehicle.type)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <UserIcon className="size-3" />
            {driver ? (
              <span className="truncate font-semibold text-primary">
                {driver.firstName} {driver.lastName}
              </span>
            ) : (
              <span className="italic">Unassigned</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {site ? (
              <span className="truncate font-semibold text-primary">
                {site.name}
              </span>
            ) : (
              <span className="italic">No site</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1">
            <Gauge className="size-3" />
            <span className="font-semibold text-primary">
              {vehicle.mileage > 0 ? vehicle.mileage : "—"}
            </span>
            <span>km/L</span>
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={handleDeleteClick}
          aria-label={`Delete ${vehicle.assetNumber}`}
          className="flex size-8 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/10"
        >
          <Trash2 className="size-4" />
        </button>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
    </Link>
  );
}

function VehicleStatusPill({ status }: { status: VehicleStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
        VEHICLE_STATUS_PILL[status],
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// Shown when no vehicles exist at all. Intentionally has no "Add" button —
// the toolbar above the list already exposes one, so we avoid duplicating
// the call to action inside the empty card.
function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Truck className="size-6" />
      </span>
      <div>
        <p className="text-sm font-semibold text-primary">No vehicles yet</p>
        <p className="text-xs text-muted-foreground">
          Register your first vehicle to start tracking the fleet.
        </p>
      </div>
    </div>
  );
}
