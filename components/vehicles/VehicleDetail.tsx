"use client";

// Single-vehicle detail page. Loads the vehicle + supporting driver/site
// records, renders a read-only summary, and toggles into the shared
// VehicleForm for editing.
import {
  ArrowLeft,
  Building2,
  Calendar,
  Fuel,
  Gauge,
  Hash,
  IdCard,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Trash2,
  Truck,
  User as UserIcon,
} from "@/lib/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  FormCard,
  PanelError,
  VehicleForm,
  type DriverSelection,
} from "@/components/vehicles/VehicleForm";
import { saveVehicleWithDriver } from "@/components/vehicles/saveVehicle";
import { ApiError } from "@/lib/api/client";
import { listDrivers } from "@/lib/api/drivers";
import { listMySites } from "@/lib/api/sites";
import { formatDate } from "@/lib/time/format";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import {
  formatLicenseClass,
  prettyEnum,
  type ApiDriver,
  type ApiSite,
  type ApiVehicle,
  type VehicleStatus,
} from "@/lib/api/types";
import {
  deleteVehicle,
  getVehicle,
  type CreateVehicleRequest,
} from "@/lib/api/vehicles";
import { cn } from "@/lib/utils";

// Same status palette used by the list panel - kept here too so this page
// renders correctly even if imported standalone.
const VEHICLE_STATUS_PILL: Record<VehicleStatus, string> = {
  ACTIVE: "bg-success/15 text-success",
  IDLE: "bg-blue-50 text-blue-700",
  IN_MAINTENANCE: "bg-amber-50 text-amber-700",
  OUT_OF_SERVICE: "bg-destructive/15 text-destructive",
  RETIRED: "bg-slate-200 text-slate-700",
};

export function VehicleDetail({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const { settings: timeSettings } = useTimeSettings();

  const [vehicle, setVehicle] = useState<ApiVehicle | null>(null);
  const [drivers, setDrivers] = useState<ApiDriver[]>([]);
  const [sites, setSites] = useState<ApiSite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // "view" by default; flips to "edit" when the user taps the Edit button.
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [isDeleting, setIsDeleting] = useState(false);
  // Controls the delete confirmation dialog. Opened by the Delete button.
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [v, d, s] = await Promise.all([
        getVehicle(vehicleId),
        listDrivers().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiDriver[];
          throw err;
        }),
        listMySites().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiSite[];
          throw err;
        }),
      ]);
      setVehicle(v);
      setDrivers(d);
      setSites(s);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load vehicle.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Resolve helpers driven by the loaded vehicle.
  const assignedDriver = vehicle
    ? (drivers.find((d) => d.assignedVehicleId === vehicle.id) ?? null)
    : null;
  const assignedSite =
    vehicle && vehicle.siteId
      ? (sites.find((s) => s.id === vehicle.siteId) ?? null)
      : null;

  async function handleEditSubmit(args: {
    payload: CreateVehicleRequest;
    status: VehicleStatus | null;
    driverSelection: DriverSelection;
  }): Promise<void> {
    if (!vehicle) return;
    await saveVehicleWithDriver({
      payload: args.payload,
      status: args.status,
      driverSelection: args.driverSelection,
      editingVehicleId: vehicle.id,
      previousDriverId: assignedDriver?.id ?? null,
    });
    setMode("view");
    await refresh();
  }

  // Runs after the confirm dialog resolves. Routes back to the list on
  // success; leaves the user on the page with an inline error otherwise.
  async function handleConfirmedDelete(): Promise<void> {
    if (!vehicle) return;
    setIsDeleting(true);
    try {
      await deleteVehicle(vehicle.id);
      router.replace("/vehicles");
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to delete vehicle.",
      );
      setIsDeleting(false);
    }
  }

  // ---- Loading / error states --------------------------------------------
  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-10">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !vehicle) {
    return (
      <div className="space-y-3">
        <BackLink />
        <PanelError message={loadError ?? "Vehicle not found."} />
      </div>
    );
  }

  // ---- Edit mode ----------------------------------------------------------
  if (mode === "edit") {
    return (
      <div className="space-y-4">
        <BackLink />
        <VehicleForm
          initial={vehicle}
          initialDriver={assignedDriver}
          sites={sites}
          drivers={drivers}
          onCancel={() => setMode("view")}
          onSubmit={handleEditSubmit}
        />
      </div>
    );
  }

  // ---- View mode ----------------------------------------------------------
  return (
    <div className="space-y-5 fs-panel-in">
      <BackLink />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Truck className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
                Asset
              </p>
              <h2 className="truncate font-mono text-xl font-semibold text-primary">
                {vehicle.assetNumber}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                  {vehicle.plateNumber}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                    VEHICLE_STATUS_PILL[vehicle.status],
                  )}
                >
                  {vehicle.status.replace("_", " ")}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                  {prettyEnum(vehicle.type)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => setMode("edit")}
              disabled={isDeleting}
              className="h-10 gap-2 rounded-xl bg-primary px-4 text-sm font-semibold shadow-md shadow-primary/20 hover:bg-surface-tint"
            >
              <Pencil className="size-4" />
              Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={isDeleting}
              className="h-10 gap-2 rounded-xl border-destructive/30 bg-white px-4 text-sm font-semibold text-destructive hover:bg-destructive/10"
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FormCard
          title="Identification"
          description="How this vehicle is identified in the system."
          icon={IdCard}
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <DetailField icon={Hash} label="Asset number">
              <span className="font-mono">{vehicle.assetNumber}</span>
            </DetailField>
            <DetailField label="Plate number">{vehicle.plateNumber}</DetailField>
            <DetailField label="Type">{prettyEnum(vehicle.type)}</DetailField>
            <DetailField label="Status">
              {prettyEnum(vehicle.status)}
            </DetailField>
          </dl>
        </FormCard>

        <FormCard
          title="Fuel"
          description="Tank size and recorded fuel consumption."
          icon={Fuel}
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Fuel type">
              {prettyEnum(vehicle.fuelType)}
            </DetailField>
            <DetailField label="Fuel capacity">
              {vehicle.fuelCapacity > 0
                ? `${vehicle.fuelCapacity} L`
                : "Not set"}
            </DetailField>
            <DetailField icon={Gauge} label="Fuel consumption">
              {vehicle.mileage > 0 ? `${vehicle.mileage} km/L` : "Not set"}
            </DetailField>
          </dl>
        </FormCard>

        <FormCard
          title="Assigned site"
          description="Construction site this vehicle is operating out of."
          icon={Building2}
        >
          {assignedSite ? (
            <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-primary">
                  {assignedSite.name}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  <MapPin className="mr-1 inline size-3 -translate-y-px" />
                  {assignedSite.city}
                  {assignedSite.state ? `, ${assignedSite.state}` : ""}
                  <span className="mx-1.5 text-slate-300">·</span>
                  {prettyEnum(assignedSite.type)}
                </p>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-xs italic text-muted-foreground">
              Not assigned to any site.
            </p>
          )}
        </FormCard>

        <FormCard
          title="Driver"
          description="Driver currently linked to this vehicle."
          icon={UserIcon}
        >
          {assignedDriver ? (
            <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-white">
                {assignedDriver.firstName[0]}
                {assignedDriver.lastName[0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-primary">
                  {assignedDriver.firstName} {assignedDriver.lastName}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {assignedDriver.employeeId}
                  <span className="mx-1.5 text-slate-300">·</span>
                  {assignedDriver.licenseNumber}
                  <span className="mx-1.5 text-slate-300">·</span>
                  {formatLicenseClass(assignedDriver.licenseClass)}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {assignedDriver.phoneNumber && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3" />
                      {assignedDriver.phoneNumber}
                    </span>
                  )}
                  {assignedDriver.licenseExpiry && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="size-3" />
                      License expires{" "}
                      {formatDate(assignedDriver.licenseExpiry, timeSettings)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-xs italic text-muted-foreground">
              No driver assigned yet.
            </p>
          )}
        </FormCard>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete vehicle?"
        description={
          <>
            You&apos;re about to permanently delete{" "}
            <span className="font-mono font-semibold text-primary">
              {vehicle.assetNumber}
            </span>{" "}
            ({vehicle.plateNumber}). This action cannot be undone.
          </>
        }
        confirmLabel="Delete vehicle"
        destructive
        onConfirm={handleConfirmedDelete}
      />
    </div>
  );
}

// ----- Helpers --------------------------------------------------------------

function BackLink() {
  return (
    <Link
      href="/vehicles"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
    >
      <ArrowLeft className="size-3.5" />
      Back to vehicles
    </Link>
  );
}

// Single label/value row used to render read-only fields. Mirrors the look
// of `SettingsField` but with a dt/dd pair so it's a proper description list.
function DetailField({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
      <dt className="font-label-caps mb-1 flex items-center gap-1 text-[10px] tracking-wide text-muted-foreground uppercase">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </dt>
      <dd className="text-sm font-semibold text-primary">{children}</dd>
    </div>
  );
}
