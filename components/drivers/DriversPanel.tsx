"use client";

// Drivers Management panel - list, search, filter, add, edit, and delete.
// Edits happen inline in the same panel (the panel switches to the form
// view), matching the simpler shape of the drivers domain compared to
// vehicles which have their own detail page.
import {
  Building2,
  ChevronRight,
  Filter,
  IdCard,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Truck,
  UserPlus,
  UserRound,
} from "@/lib/icons";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DriverForm,
  type VehicleSelection,
} from "@/components/drivers/DriverForm";
import { fieldClass } from "@/components/settings/SettingsShared";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/Pagination";
import { PanelError } from "@/components/vehicles/VehicleForm";
import { ApiError } from "@/lib/api/client";
import {
  createDriver,
  deleteDriver,
  listDrivers,
  listDriversPage,
  updateDriver,
  type CreateDriverRequest,
  type UpdateDriverRequest,
} from "@/lib/api/drivers";
import { useCursorPagedList } from "@/lib/api/useCursorPagedList";
import { listMySites } from "@/lib/api/sites";
import { createVehicle, listVehicles } from "@/lib/api/vehicles";
import {
  DRIVER_STATUSES,
  formatLicenseClass,
  prettyEnum,
  type ApiDriver,
  type ApiSite,
  type ApiVehicle,
  type DriverStatus,
} from "@/lib/api/types";
import { driverSiteName } from "@/lib/drivers/resolveDriverSite";
import { SiteScopeEmptyState } from "@/components/shared/SiteScopeEmptyState";
import { Can, useCan } from "@/components/auth/Can";
import { useScopedSiteIds } from "@/lib/auth/useScopedSiteIds";
import { staggerStyle } from "@/lib/animations";
import { cn } from "@/lib/utils";

// Tailwind classes for the driver status pill, kept in one place so colors
// stay consistent wherever this is rendered.
const DRIVER_STATUS_PILL: Record<DriverStatus, string> = {
  ACTIVE: "bg-success/15 text-success",
  ON_LEAVE: "bg-amber-50 text-amber-700",
  SUSPENDED: "bg-destructive/15 text-destructive",
  TERMINATED: "bg-slate-200 text-slate-700",
};

// View modes: list (default), add new, or edit an existing driver.
type Mode =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; driver: ApiDriver };

export function DriversPanel({
  density = "comfortable",
}: {
  density?: "comfortable" | "compact";
}) {
  const [allDrivers, setAllDrivers] = useState<ApiDriver[]>([]);
  const [sites, setSites] = useState<ApiSite[]>([]);
  const [vehicles, setVehicles] = useState<ApiVehicle[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // "ALL" means no filter; otherwise narrow the list by status.
  const [statusFilter, setStatusFilter] = useState<DriverStatus | "ALL">(
    "ALL",
  );
  // "ALL" means no filter; otherwise narrow by the assigned vehicle's site.
  const [siteFilter, setSiteFilter] = useState<string>("ALL");
  const [auxLoading, setAuxLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Driver pending a delete confirmation. null keeps the dialog closed.
  const [pendingDelete, setPendingDelete] = useState<ApiDriver | null>(null);
  const { hasAssignments } = useScopedSiteIds();

  // RBAC for the action surfaces. Rows pass these down so each driver
  // card hides its own pencil/trash when the user lacks the slug. The
  // top-bar "Add Driver" button is gated by <Can> directly.
  const canUpdateDriver = useCan("drivers.update");
  const canDeleteDriver = useCan("drivers.delete");

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const driverList = useCursorPagedList({
    fetchPage: (cursor, limit) =>
      listDriversPage({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        siteId: siteFilter === "ALL" ? undefined : siteFilter,
        search: debouncedSearch || undefined,
        cursor,
        limit,
      }),
    deps: [statusFilter, siteFilter, debouncedSearch],
  });

  const refreshAux = useCallback(async () => {
    setAuxLoading(true);
    setLoadError(null);
    try {
      const [d, s, v] = await Promise.all([
        listDrivers().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiDriver[];
          throw err;
        }),
        listMySites().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiSite[];
          throw err;
        }),
        listVehicles().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiVehicle[];
          throw err;
        }),
      ]);
      setAllDrivers(d);
      setSites(s);
      setVehicles(v);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load drivers.",
      );
    } finally {
      setAuxLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAux();
  }, [refreshAux]);

  useEffect(() => {
    if (driverList.error) {
      setLoadError(driverList.error.message);
    }
  }, [driverList.error]);

  const refresh = useCallback(async () => {
    await Promise.all([driverList.reload(), refreshAux()]);
  }, [driverList, refreshAux]);

  // O(1) lookup of vehicle records by id, for showing the assigned vehicle.
  const vehicleById = useMemo(() => {
    const map = new Map<string, ApiVehicle>();
    for (const v of vehicles) map.set(v.id, v);
    return map;
  }, [vehicles]);

  // Map of vehicleId -> driver currently linked to it. We need this so the
  // edit form can show the driver's own vehicle as still selectable while
  // hiding vehicles claimed by *other* drivers.
  const driverByVehicleId = useMemo(() => {
    const map = new Map<string, ApiDriver>();
    for (const d of allDrivers) {
      if (d.assignedVehicleId) map.set(d.assignedVehicleId, d);
    }
    return map;
  }, [allDrivers]);

  const filteredDrivers = driverList.items;

  const isLoading = auxLoading || driverList.isLoading;

  // Resolve a VehicleSelection into the assignedVehicleId that should land
  // on the driver record. For "new" we create the vehicle first and return
  // the new id. For "existing" we return the id directly. For "none" we
  // return null (which clears any existing link on update).
  async function resolveVehicleAssignment(
    selection: VehicleSelection,
  ): Promise<string | null> {
    if (selection.kind === "existing") return selection.vehicleId;
    if (selection.kind === "new") {
      const created = await createVehicle(selection.payload);
      return created.id;
    }
    return null;
  }

  // Create handler - orchestrates the vehicle-then-driver save. We create
  // the vehicle (if requested) first so we can stamp its id onto the
  // driver's create payload in a single transaction-shaped flow.
  async function handleCreate(
    payload: CreateDriverRequest,
    selection: VehicleSelection,
  ): Promise<void> {
    const assignedVehicleId = await resolveVehicleAssignment(selection);
    await createDriver({
      ...payload,
      assignedVehicleId: assignedVehicleId ?? undefined,
    });
    setMode({ kind: "list" });
    await refresh();
  }

  // Update handler - mirrors create. When the user picks "no vehicle" on a
  // driver that previously had one assigned, we explicitly send null to
  // clear the foreign key.
  async function handleUpdate(
    id: string,
    payload: UpdateDriverRequest,
    selection: VehicleSelection,
  ): Promise<void> {
    const assignedVehicleId = await resolveVehicleAssignment(selection);
    await updateDriver(id, {
      ...payload,
      assignedVehicleId: assignedVehicleId,
    });
    setMode({ kind: "list" });
    await refresh();
  }

  // Runs after the confirmation dialog resolves.
  async function handleConfirmedDelete(target: ApiDriver): Promise<void> {
    try {
      await deleteDriver(target.id);
      await refresh();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to delete driver.",
      );
    }
  }

  // ---- Form view (create / edit) ------------------------------------------
  if (mode.kind === "create" || mode.kind === "edit") {
    const editing = mode.kind === "edit" ? mode.driver : null;
    return (
      <DriverForm
        initial={editing}
        sites={sites}
        vehicles={vehicles}
        driverByVehicleId={driverByVehicleId}
        onCancel={() => setMode({ kind: "list" })}
        onSubmit={async ({ createPayload, updatePayload, vehicleSelection }) => {
          if (editing) {
            await handleUpdate(editing.id, updatePayload, vehicleSelection);
          } else {
            await handleCreate(createPayload, vehicleSelection);
          }
        }}
      />
    );
  }

  // ---- List view ----------------------------------------------------------
  if (!hasAssignments) {
    return <SiteScopeEmptyState />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-primary">
              {filteredDrivers.length}
            </span>{" "}
            on this page
            {driverList.isLastPageReached && driverList.totalPages !== undefined
              ? ` · ${driverList.totalPages} page${driverList.totalPages === 1 ? "" : "s"} total`
              : null}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search name, employee ID, license, or site"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${fieldClass} pl-9`}
                aria-label="Search drivers"
              />
            </div>
            <div className="w-full sm:w-44">
              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v as DriverStatus | "ALL")
                }
                leftIcon={Filter}
                aria-label="Filter by status"
                options={[
                  { value: "ALL", label: "All statuses" },
                  ...DRIVER_STATUSES.map((s) => ({
                    value: s,
                    label: prettyEnum(s),
                  })),
                ]}
              />
            </div>
            <div className="w-full sm:w-56">
              <Select
                value={siteFilter}
                onValueChange={setSiteFilter}
                leftIcon={Building2}
                aria-label="Filter by site"
                options={[
                  { value: "ALL", label: "All sites" },
                  ...sites.map((s) => ({
                    value: s.id,
                    label: s.name,
                  })),
                ]}
              />
            </div>
          </div>
        </div>
        <Can permission="drivers.create">
          <Button
            onClick={() => setMode({ kind: "create" })}
            className="h-10 gap-2 self-start rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint sm:self-auto"
          >
            <Plus className="size-4" />
            Add Driver
          </Button>
        </Can>
      </div>

      {loadError && <PanelError message={loadError} />}

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-8">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : filteredDrivers.length === 0 ? (
        driverList.items.length === 0 && siteFilter === "ALL" ? (
          <EmptyState />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
            <UserRound className="mx-auto mb-2 size-6 text-muted-foreground" />
            <p className="text-sm font-medium text-primary">
              No drivers match your filters.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try clearing a filter or refining your search.
            </p>
            {(statusFilter !== "ALL" || siteFilter !== "ALL") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter("ALL");
                  setSiteFilter("ALL");
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
          {filteredDrivers.map((driver, index) => (
            <div
              key={driver.id}
              className="fs-row-in"
              style={staggerStyle(index)}
            >
            <DriverRow
              driver={driver}
              vehicle={
                driver.assignedVehicleId
                  ? (vehicleById.get(driver.assignedVehicleId) ?? null)
                  : null
              }
              siteName={driverSiteName(
                {
                  ...driver,
                  assignedVehicle:
                    driver.assignedVehicle ??
                    (driver.assignedVehicleId
                      ? (vehicleById.get(driver.assignedVehicleId) ?? null)
                      : null),
                },
                sites,
              )}
              density={density}
              canEdit={canUpdateDriver}
              canDelete={canDeleteDriver}
              onEdit={() => setMode({ kind: "edit", driver })}
              onDelete={() => setPendingDelete(driver)}
            />
            </div>
          ))}
          <Pagination
            page={driverList.page}
            pageSize={driverList.pageSize}
            highestKnownPage={driverList.highestKnownPage}
            totalPages={driverList.totalPages}
            isLastPageReached={driverList.isLastPageReached}
            isLoading={driverList.isLoading}
            onPageChange={(p) => void driverList.goToPage(p)}
            onPageSizeChange={driverList.setPageSize}
          />
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete driver?"
        description={
          pendingDelete ? (
            <>
              You&apos;re about to permanently delete{" "}
              <span className="font-semibold text-primary">
                {pendingDelete.firstName} {pendingDelete.lastName}
              </span>{" "}
              ({pendingDelete.employeeId}). This action cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete driver"
        destructive
        onConfirm={async () => {
          if (pendingDelete) await handleConfirmedDelete(pendingDelete);
        }}
      />
    </div>
  );
}

// Each list entry renders a card with driver info and inline edit / delete
// actions. Tapping anywhere outside the action buttons triggers edit.
function DriverRow({
  driver,
  vehicle,
  siteName,
  density,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  driver: ApiDriver;
  vehicle: ApiVehicle | null;
  siteName: string | null;
  density: "comfortable" | "compact";
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 transition-colors hover:border-primary/30 hover:bg-white",
        density === "compact" ? "p-3" : "p-4",
      )}
    >
      <Link
        href={`/drivers/${driver.id}`}
        className="group/link flex min-w-0 flex-1 items-center gap-3"
        aria-label={`Open profile for ${driver.firstName} ${driver.lastName}`}
      >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <UserRound className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-primary">
            {driver.firstName} {driver.lastName}
          </p>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
            {driver.employeeId}
          </span>
          <DriverStatusPill status={driver.status} />
          <span
            className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase"
            title={formatLicenseClass(driver.licenseClass)}
          >
            {formatLicenseClass(driver.licenseClass, "short")}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Building2 className="size-3" />
            {siteName ? (
              <span className="truncate font-semibold text-primary">
                {siteName}
              </span>
            ) : (
              <span className="italic">No site</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1">
            <Truck className="size-3" />
            {vehicle ? (
              <span className="truncate font-semibold text-primary">
                {vehicle.assetNumber}
              </span>
            ) : (
              <span className="italic">No vehicle</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1">
            <IdCard className="size-3" />
            <span className="font-mono font-semibold text-primary">
              {driver.licenseNumber}
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Phone className="size-3" />
            <span className="font-semibold text-primary">
              {driver.phoneNumber}
            </span>
          </span>
          {driver.email && (
            <span className="inline-flex items-center gap-1">
              <Mail className="size-3" />
              <span className="truncate font-semibold text-primary">
                {driver.email}
              </span>
            </span>
          )}
        </div>
      </div>
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${driver.firstName} ${driver.lastName}`}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <Pencil className="size-4" />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${driver.firstName} ${driver.lastName}`}
            className="flex size-8 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="size-4" />
          </button>
        )}
        <Link
          href={`/drivers/${driver.id}`}
          aria-label={`Open profile for ${driver.firstName} ${driver.lastName}`}
          className="group/chev flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <ChevronRight className="size-4 transition-transform group-hover/chev:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

function DriverStatusPill({ status }: { status: DriverStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
        DRIVER_STATUS_PILL[status],
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

// Shown when no drivers exist at all. Intentionally has no "Add" button —
// the toolbar above the list already exposes one, so we avoid duplicating
// the call to action inside the empty card.
function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <UserPlus className="size-6" />
      </span>
      <div>
        <p className="text-sm font-semibold text-primary">No drivers yet</p>
        <p className="text-xs text-muted-foreground">
          Register your first driver and assign a vehicle — the site follows the
          truck.
        </p>
      </div>
    </div>
  );
}
