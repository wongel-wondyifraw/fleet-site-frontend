"use client";

import {
  ArrowLeft,
  Building2,
  Calendar,
  ChevronRight,
  Clock,
  IdCard,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Route,
  Trash2,
  Truck,
  UserRound,
} from "@/lib/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

import { DriverForm, type VehicleSelection } from "@/components/drivers/DriverForm";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormCard, PanelError } from "@/components/vehicles/VehicleForm";
import { ApiError } from "@/lib/api/client";
import { getDriverAttendanceHistory } from "@/lib/api/attendance";
import {
  deleteDriver,
  getDriver,
  listDrivers,
  updateDriver,
  type CreateDriverRequest,
  type UpdateDriverRequest,
} from "@/lib/api/drivers";
import { listSites } from "@/lib/api/sites";
import { listTrips } from "@/lib/api/trips";
import { createVehicle, listVehicles } from "@/lib/api/vehicles";
import { toLocalDateKey } from "@/lib/attendance/attendanceHelpers";
import { driverSiteName } from "@/lib/drivers/resolveDriverSite";
import { formatDate, formatDateTime } from "@/lib/time/format";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import {
  formatLicenseClass,
  prettyEnum,
  type ApiAttendanceDay,
  type ApiDriver,
  type ApiSite,
  type ApiTrip,
  type ApiVehicle,
  type DriverStatus,
} from "@/lib/api/types";
import {
  formatLocationLine,
  getTripEffectiveDate,
} from "@/lib/trips/tripFormatters";
import { TRIP_STATUS_PILL } from "@/lib/trips/tripFormState";
import { cn } from "@/lib/utils";

const DRIVER_STATUS_PILL: Record<DriverStatus, string> = {
  ACTIVE: "bg-success/15 text-success",
  ON_LEAVE: "bg-amber-50 text-amber-700",
  SUSPENDED: "bg-destructive/15 text-destructive",
  TERMINATED: "bg-slate-200 text-slate-700",
};

const ATTENDANCE_STATUS_PILL: Record<string, string> = {
  EXPECTED: "bg-blue-50 text-blue-700",
  PRESENT: "bg-blue-50 text-blue-700",
  ON_BREAK: "bg-blue-50 text-blue-700",
  DONE: "bg-emerald-50 text-emerald-700",
  ABSENT: "bg-rose-50 text-rose-700",
  ON_LEAVE: "bg-slate-100 text-slate-700",
};

export function DriverDetail({ driverId }: { driverId: string }) {
  const router = useRouter();
  const { settings: timeSettings } = useTimeSettings();

  const [driver, setDriver] = useState<ApiDriver | null>(null);
  const [sites, setSites] = useState<ApiSite[]>([]);
  const [vehicles, setVehicles] = useState<ApiVehicle[]>([]);
  const [allDrivers, setAllDrivers] = useState<ApiDriver[]>([]);
  const [recentTrips, setRecentTrips] = useState<ApiTrip[]>([]);
  const [recentDays, setRecentDays] = useState<ApiAttendanceDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const to = toLocalDateKey(new Date());
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 29);
    const from = toLocalDateKey(fromDate);

    try {
      const [d, s, v, drivers, trips, history] = await Promise.all([
        getDriver(driverId),
        listSites().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiSite[];
          throw err;
        }),
        listVehicles().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiVehicle[];
          throw err;
        }),
        listDrivers().catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiDriver[];
          throw err;
        }),
        listTrips({ driverId, limit: 20 }).catch((err) => {
          if (err instanceof ApiError && err.isAuth) return [] as ApiTrip[];
          throw err;
        }),
        getDriverAttendanceHistory(driverId, { from, to }).catch((err) => {
          if (err instanceof ApiError && err.isAuth) {
            return { driver: null, days: [] as ApiAttendanceDay[] };
          }
          throw err;
        }),
      ]);
      setDriver(d);
      setSites(s);
      setVehicles(v);
      setAllDrivers(drivers);
      setRecentTrips(
        [...trips].sort((a, b) => {
          const ad = getTripEffectiveDate(a)?.getTime() ?? 0;
          const bd = getTripEffectiveDate(b)?.getTime() ?? 0;
          return bd - ad;
        }).slice(0, 8),
      );
      setRecentDays(
        [...history.days]
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .slice(0, 8),
      );
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load driver.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const vehicleById = useMemo(
    () => new Map(vehicles.map((v) => [v.id, v])),
    [vehicles],
  );
  const driverByVehicleId = useMemo(() => {
    const map = new Map<string, ApiDriver>();
    for (const d of allDrivers) {
      if (d.assignedVehicleId) map.set(d.assignedVehicleId, d);
    }
    return map;
  }, [allDrivers]);

  const assignedVehicle =
    driver?.assignedVehicle ??
    (driver?.assignedVehicleId
      ? vehicleById.get(driver.assignedVehicleId) ?? null
      : null);
  const siteName = driver
    ? driverSiteName(driver, vehicleById, sites)
    : null;

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

  async function handleEditSubmit(args: {
    createPayload: CreateDriverRequest;
    updatePayload: UpdateDriverRequest;
    vehicleSelection: VehicleSelection;
  }): Promise<void> {
    if (!driver) return;
    const assignedVehicleId = await resolveVehicleAssignment(
      args.vehicleSelection,
    );
    await updateDriver(driver.id, {
      ...args.updatePayload,
      assignedVehicleId,
    });
    setMode("view");
    await refresh();
  }

  async function handleConfirmedDelete(): Promise<void> {
    if (!driver) return;
    setIsDeleting(true);
    try {
      await deleteDriver(driver.id);
      router.replace("/drivers");
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to delete driver.",
      );
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-10">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !driver) {
    return (
      <div className="space-y-3">
        <BackLink />
        <PanelError message={loadError ?? "Driver not found."} />
      </div>
    );
  }

  if (mode === "edit") {
    return (
      <div className="space-y-4">
        <BackLink />
        <DriverForm
          initial={driver}
          sites={sites}
          vehicles={vehicles}
          driverByVehicleId={driverByVehicleId}
          onCancel={() => setMode("view")}
          onSubmit={async ({ createPayload, updatePayload, vehicleSelection }) => {
            void createPayload;
            await handleEditSubmit({ createPayload, updatePayload, vehicleSelection });
          }}
        />
      </div>
    );
  }

  const fullName = `${driver.firstName} ${driver.lastName}`.trim();

  return (
    <div className="space-y-5 fs-panel-in">
      <BackLink />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
              {driver.firstName?.[0] ?? "?"}
              {driver.lastName?.[0] ?? ""}
            </span>
            <div className="min-w-0">
              <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
                Driver
              </p>
              <h2 className="truncate text-xl font-semibold text-primary">
                {fullName || "Unnamed driver"}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                  {driver.employeeId}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                    DRIVER_STATUS_PILL[driver.status],
                  )}
                >
                  {driver.status.replace("_", " ")}
                </span>
                <span
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase"
                  title={formatLicenseClass(driver.licenseClass)}
                >
                  {formatLicenseClass(driver.licenseClass, "short")}
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
            <Link
              href={`/attendance/drivers/${driver.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              <Clock className="size-4" />
              Attendance
            </Link>
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
        <FormCard title="Profile" description="Employment and contact details." icon={UserRound}>
          <dl className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Employee ID">{driver.employeeId}</DetailField>
            <DetailField label="Status">{prettyEnum(driver.status)}</DetailField>
            <DetailField icon={Calendar} label="Hire date">
              {formatDate(driver.hireDate, timeSettings)}
            </DetailField>
            <DetailField icon={Building2} label="Home site">
              {siteName ?? "Not set"}
            </DetailField>
            <DetailField icon={Phone} label="Phone">
              {driver.phoneNumber}
            </DetailField>
            <DetailField icon={Mail} label="Email">
              {driver.email ?? "—"}
            </DetailField>
          </dl>
        </FormCard>

        <FormCard title="License" description="Driving credentials on file." icon={IdCard}>
          <dl className="grid gap-3 sm:grid-cols-2">
            <DetailField label="License number">
              <span className="font-mono">{driver.licenseNumber}</span>
            </DetailField>
            <DetailField label="Class">
              {formatLicenseClass(driver.licenseClass)}
            </DetailField>
            <DetailField icon={Calendar} label="Expiry">
              {formatDate(driver.licenseExpiry, timeSettings)}
            </DetailField>
          </dl>
        </FormCard>

        <FormCard title="Assigned vehicle" description="Vehicle linked to this driver." icon={Truck}>
          {assignedVehicle ? (
            <Link
              href={`/vehicles/${assignedVehicle.id}`}
              className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Truck className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-semibold text-primary">
                  {assignedVehicle.assetNumber}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {assignedVehicle.plateNumber}
                  <span className="mx-1.5 text-slate-300">·</span>
                  {prettyEnum(assignedVehicle.type)}
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center text-xs italic text-muted-foreground">
              No vehicle assigned.
            </p>
          )}
        </FormCard>

        {driver.notes ? (
          <FormCard title="Notes" description="Internal notes for this driver." icon={IdCard}>
            <p className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm text-slate-700">
              {driver.notes}
            </p>
          </FormCard>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-primary">Recent trips</h3>
            <Link
              href="/trips"
              className="text-[11px] font-semibold text-primary/70 hover:text-primary"
            >
              View all
            </Link>
          </div>
          {recentTrips.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-6 text-center text-xs italic text-muted-foreground">
              No trips recorded for this driver yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentTrips.map((trip) => (
                <li key={trip.id}>
                  <Link
                    href={`/trips/${trip.id}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 transition-colors hover:border-primary/30 hover:bg-white"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Route className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-primary">
                        {formatLocationLine(trip.startAddress, trip.startCity, trip.startState)}
                        {" → "}
                        {formatLocationLine(trip.endAddress, trip.endCity, trip.endState)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {getTripEffectiveDate(trip)
                          ? formatDateTime(getTripEffectiveDate(trip)!.toISOString(), timeSettings)
                          : "—"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase",
                        TRIP_STATUS_PILL[trip.status],
                      )}
                    >
                      {trip.status.replace("_", " ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-primary">Recent attendance</h3>
            <Link
              href={`/attendance/drivers/${driver.id}`}
              className="text-[11px] font-semibold text-primary/70 hover:text-primary"
            >
              Full history
            </Link>
          </div>
          {recentDays.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-6 text-center text-xs italic text-muted-foreground">
              No attendance records in the last 30 days.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentDays.map((day) => (
                <li
                  key={day.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-primary">
                      {formatDate(`${day.date}T00:00:00`, timeSettings, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {day.site?.name ?? "Unknown site"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase",
                      ATTENDANCE_STATUS_PILL[day.status] ?? "bg-slate-100 text-slate-700",
                    )}
                  >
                    {day.status.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete driver?"
        description={
          <>
            You&apos;re about to permanently delete{" "}
            <span className="font-semibold text-primary">{fullName}</span> (
            {driver.employeeId}). This action cannot be undone.
          </>
        }
        confirmLabel="Delete driver"
        destructive
        onConfirm={handleConfirmedDelete}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/drivers"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
    >
      <ArrowLeft className="size-3.5" />
      Back to drivers
    </Link>
  );
}

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
