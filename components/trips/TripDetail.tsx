"use client";

import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Calendar,
  ChevronRight,
  CircleCheck,
  Gauge,
  Loader2,
  MapPin,
  Play,
  Route,
  Timer,
  Truck,
  UserRound,
} from "@/lib/icons";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";

import { PanelError } from "@/components/vehicles/VehicleForm";
import { ApiError } from "@/lib/api/client";
import { getDriver } from "@/lib/api/drivers";
import { getTrip } from "@/lib/api/trips";
import { getVehicle } from "@/lib/api/vehicles";
import { formatDateTime } from "@/lib/time/format";
import { useTimeSettings } from "@/lib/time/TimeSettingsContext";
import type { ApiDriver, ApiTrip, ApiVehicle, TripStatus } from "@/lib/api/types";
import {
  formatDistance,
  formatDuration,
  formatLocationLine,
  getTripDistanceKm,
  getTripEffectiveDate,
} from "@/lib/trips/tripFormatters";
import { TRIP_STATUS_PILL } from "@/lib/trips/tripFormState";
import { cn } from "@/lib/utils";

type TimelineStep = {
  id: string;
  label: string;
  status: TripStatus;
  timestamp: string | null | undefined;
  description: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  completed: boolean;
};

export function TripDetail({ tripId }: { tripId: string }) {
  const { settings: timeSettings } = useTimeSettings();
  const [trip, setTrip] = useState<ApiTrip | null>(null);
  const [driver, setDriver] = useState<ApiDriver | null>(null);
  const [vehicle, setVehicle] = useState<ApiVehicle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const t = await getTrip(tripId);
      setTrip(t);
      const [d, v] = await Promise.all([
        t.driverId
          ? getDriver(t.driverId).catch(() => null)
          : Promise.resolve(null),
        t.vehicleId
          ? getVehicle(t.vehicleId).catch(() => null)
          : Promise.resolve(null),
      ]);
      setDriver(d);
      setVehicle(v);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Unable to load trip.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const distanceKm = useMemo(
    () => (trip ? getTripDistanceKm(trip) : null),
    [trip],
  );

  const elapsedMs = useMemo(() => {
    if (!trip?.startedAt) return null;
    const start = new Date(trip.startedAt).getTime();
    const end = trip.completedAt
      ? new Date(trip.completedAt).getTime()
      : Date.now();
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    return Math.max(0, end - start);
  }, [trip]);

  const timeline = useMemo((): TimelineStep[] => {
    if (!trip) return [];
    const statusOrder: TripStatus[] = [
      "PLANNED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ];
    const currentIdx = statusOrder.indexOf(trip.status);

    const plannedTs = trip.scheduledAt ?? trip.createdAt;
    const steps: TimelineStep[] = [
      {
        id: "planned",
        label: "Planned",
        status: "PLANNED",
        timestamp: plannedTs,
        description: "Trip scheduled and ready for checkout.",
        icon: Calendar,
        active: trip.status === "PLANNED",
        completed: currentIdx > 0 || trip.status === "CANCELLED",
      },
      {
        id: "checkout",
        label: "Checked out",
        status: "IN_PROGRESS",
        timestamp: trip.startedAt,
        description: "Driver checked out and trip is in progress.",
        icon: Play,
        active: trip.status === "IN_PROGRESS",
        completed:
          trip.status === "COMPLETED" ||
          (trip.status === "CANCELLED" && !!trip.startedAt),
      },
      {
        id: "complete",
        label: "Completed",
        status: "COMPLETED",
        timestamp: trip.completedAt,
        description:
          distanceKm != null
            ? `Checked in · ${formatDistance(distanceKm)} recorded`
            : "Driver checked in at destination.",
        icon: CircleCheck,
        active: trip.status === "COMPLETED",
        completed: trip.status === "COMPLETED",
      },
    ];

    if (trip.status === "CANCELLED") {
      steps.push({
        id: "cancelled",
        label: "Cancelled",
        status: "CANCELLED",
        timestamp: trip.updatedAt ?? trip.createdAt,
        description: "Trip was cancelled before completion.",
        icon: Ban,
        active: true,
        completed: true,
      });
    }

    return steps;
  }, [trip, distanceKm]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/50 p-10">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !trip) {
    return (
      <div className="space-y-3">
        <BackLink />
        <PanelError message={loadError ?? "Trip not found."} />
      </div>
    );
  }

  const effectiveDate = getTripEffectiveDate(trip);

  return (
    <div className="space-y-5 fs-panel-in">
      <BackLink />

      <div
        className={cn(
          "rounded-2xl border bg-white p-5 shadow-sm",
          trip.status === "IN_PROGRESS"
            ? "border-amber-200"
            : "border-slate-200",
        )}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
              Trip route
            </p>
            <h2 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold text-primary lg:text-xl">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4 shrink-0 text-primary/70" />
                <span className="truncate">
                  {formatLocationLine(
                    trip.startAddress,
                    trip.startCity,
                    trip.startState,
                  )}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4 shrink-0 text-primary/70" />
                <span className="truncate">
                  {formatLocationLine(
                    trip.endAddress,
                    trip.endCity,
                    trip.endState,
                  )}
                </span>
              </span>
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                  TRIP_STATUS_PILL[trip.status],
                )}
              >
                {trip.status.replace("_", " ")}
              </span>
              {trip.isRoundTrip ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-primary uppercase">
                  Round trip
                </span>
              ) : null}
              {effectiveDate ? (
                <span className="text-[11px] text-muted-foreground">
                  {formatDateTime(effectiveDate.toISOString(), timeSettings)}
                </span>
              ) : null}
              {trip.status === "IN_PROGRESS" && elapsedMs !== null ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide text-amber-800 tabular-nums">
                  <Timer className="size-3 animate-pulse" />
                  {formatDuration(elapsedMs)}
                </span>
              ) : null}
            </div>
          </div>
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Route className="size-7" />
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <LinkCard
          href={driver ? `/drivers/${driver.id}` : "#"}
          disabled={!driver}
          icon={UserRound}
          title={driver ? `${driver.firstName} ${driver.lastName}` : "Unknown driver"}
          subtitle={driver?.employeeId ?? "No driver linked"}
        />
        <LinkCard
          href={vehicle ? `/vehicles/${vehicle.id}` : "#"}
          disabled={!vehicle}
          icon={Truck}
          title={
            vehicle
              ? `${vehicle.assetNumber ?? vehicle.plateNumber}`
              : "Unknown vehicle"
          }
          subtitle={vehicle?.plateNumber ?? "No vehicle linked"}
        />
        <StatCard
          icon={Gauge}
          title="Distance"
          value={distanceKm != null ? formatDistance(distanceKm) : "—"}
          subtitle={
            elapsedMs != null && trip.status === "COMPLETED"
              ? `Duration ${formatDuration(elapsedMs)}`
              : trip.status === "IN_PROGRESS"
                ? "In progress"
                : "Not recorded"
          }
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
        <h3 className="mb-4 text-sm font-semibold text-primary">Status timeline</h3>
        <ol className="relative space-y-0">
          {timeline.map((step, index) => (
            <li key={step.id} className="relative flex gap-4 pb-6 last:pb-0">
              {index < timeline.length - 1 ? (
                <span
                  className={cn(
                    "absolute top-10 left-[19px] h-[calc(100%-2.5rem)] w-0.5",
                    step.completed ? "bg-primary/30" : "bg-slate-200",
                  )}
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2",
                  step.active
                    ? "border-primary bg-primary text-primary-foreground"
                    : step.completed
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-slate-200 bg-slate-50 text-muted-foreground",
                )}
              >
                <step.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <p className="text-sm font-semibold text-primary">{step.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {step.description}
                </p>
                {step.timestamp ? (
                  <p className="mt-1 text-[11px] font-medium text-primary/80">
                    {formatDateTime(step.timestamp, timeSettings)}
                  </p>
                ) : step.active || step.completed ? null : (
                  <p className="mt-1 text-[11px] italic text-muted-foreground">
                    Pending
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {trip.notes ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-5">
          <h3 className="mb-3 text-sm font-semibold text-primary">Notes</h3>
          <p className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm text-slate-700">
            {trip.notes}
          </p>
        </section>
      ) : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/trips"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
    >
      <ArrowLeft className="size-3.5" />
      Back to trips
    </Link>
  );
}

function LinkCard({
  href,
  disabled,
  icon: Icon,
  title,
  subtitle,
}: {
  href: string;
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  const inner = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-primary">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      {!disabled ? (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
    </>
  );

  if (disabled) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 opacity-70">
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-primary/30 hover:bg-primary/5"
    >
      {inner}
    </Link>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
  subtitle,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-label-caps text-[10px] tracking-wide text-muted-foreground uppercase">
          {title}
        </p>
        <p className="text-lg font-semibold text-primary tabular-nums">{value}</p>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
