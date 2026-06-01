"use client";



import { AlertTriangle, ChevronRight, Fuel, Truck } from "@/lib/icons";

import Link from "next/link";



import type { ApiFuelConsumptionDay } from "@/lib/api/types";

import {

  CONSUMPTION_ISSUE_LABELS,

  consumptionIssues,

  driverName,

  formatEstimatedLiters,

  formatKmPerLitre,

  isDistanceIncomplete,

  parseWorkDistanceKm,

  vehicleLabel,

} from "@/lib/fuel/fuelHelpers";

import { cn } from "@/lib/utils";



const fuelDetailHref = (driverId: string) =>

  `/dashboard/fuel/drivers/${driverId}`;



export function DriverFuelRow({

  day,

  density,

}: {

  day: ApiFuelConsumptionDay;

  density: "comfortable" | "compact";

}) {

  const distanceKm = parseWorkDistanceKm(day.workDistanceKm);

  const hasDistance = distanceKm != null;

  const distanceIncomplete = isDistanceIncomplete(day);

  const issues = consumptionIssues(day);

  const hasEstimate =

    day.estimatedLiters != null && Number.isFinite(day.estimatedLiters);

  const href = fuelDetailHref(day.driverId);



  return (

    <Link

      href={href}

      aria-label={`Open fuel usage detail for ${driverName(day)}`}

      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"

    >

      <article

        className={cn(

          "rounded-xl border border-slate-100 bg-slate-50/50 transition-colors group-hover:border-primary/20 group-hover:bg-primary/[0.03]",

          density === "compact" ? "p-3" : "p-4",

        )}

      >

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

          <div className="flex min-w-0 flex-1 items-center gap-3">

            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">

              {day.driver?.firstName?.[0] ?? "?"}

              {day.driver?.lastName?.[0] ?? ""}

            </span>

            <div className="min-w-0 flex-1">

              <div className="flex flex-wrap items-center gap-2">

                <p className="truncate text-sm font-semibold text-primary group-hover:underline">

                  {driverName(day)}

                </p>

                {issues.map((issue) => (

                  <span

                    key={issue}

                    title={CONSUMPTION_ISSUE_LABELS[issue]}

                    className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-800 uppercase ring-1 ring-amber-300/60"

                  >

                    <AlertTriangle className="size-2.5" />

                    {CONSUMPTION_ISSUE_LABELS[issue]}

                  </span>

                ))}

              </div>

              <p className="truncate text-xs text-muted-foreground">

                {day.driver?.employeeId ?? "No employee ID"}

              </p>

            </div>

          </div>



          <div className="flex flex-wrap items-end justify-start gap-2 lg:justify-end lg:shrink-0">

            <MetricPill

              label="Vehicle"

              icon={Truck}

              value={vehicleLabel(day)}

              muted={!day.vehicle}

              title={

                day.vehicle

                  ? `${day.vehicle.plateNumber} · ${day.vehicle.fuelType}`

                  : "Assign a vehicle to this driver to estimate consumption"

              }

            />

            <MetricPill

              label="Distance"

              value={

                hasDistance ? (

                  <>

                    {distanceKm.toFixed(1)} km

                    {distanceIncomplete ? "*" : null}

                  </>

                ) : (

                  "—"

                )

              }

              active={hasDistance}

              title={

                hasDistance

                  ? distanceIncomplete

                    ? "Distance partial — odometer missing on one or more punches"

                    : "Work distance from odometer punches"

                  : "Capture odometer at DAY_IN / LUNCH_OUT / LUNCH_IN / DAY_OUT"

              }

            />

            <MetricPill

              label="Rated"

              icon={Fuel}

              value={formatKmPerLitre(day.ratedKmPerLitre)}

              active={day.ratedKmPerLitre != null && day.ratedKmPerLitre > 0}

              title="Vehicle rated fuel economy (km/L)"

            />

            <MetricPill

              label="Est. L"

              icon={Fuel}

              value={formatEstimatedLiters(day.estimatedLiters)}

              active={hasEstimate}

              highlight

              title={

                hasEstimate

                  ? `Estimated consumption: distance ÷ rated km/L = ${day.estimatedLiters?.toFixed(2)} L`

                  : "Need distance and vehicle km/L rating to estimate"

              }

            />

            <span

              aria-hidden

              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary"

            >

              <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />

            </span>

          </div>

        </div>

      </article>

    </Link>

  );

}



function MetricPill({

  label,

  value,

  icon: Icon,

  active = false,

  muted = false,

  highlight = false,

  title,

}: {

  label: string;

  value: React.ReactNode;

  icon?: React.ComponentType<{ className?: string }>;

  active?: boolean;

  muted?: boolean;

  highlight?: boolean;

  title?: string;

}) {

  return (

    <span

      className={cn(

        "inline-flex flex-col items-center rounded-md border px-2 py-1 text-[10px] font-black tracking-wide uppercase",

        highlight && active

          ? "border-emerald-200 bg-emerald-50 text-emerald-800"

          : active

            ? "border-primary/20 bg-primary/5 text-primary"

            : muted

              ? "border-slate-200 bg-slate-50 text-slate-400"

              : "border-slate-200 bg-slate-50 text-slate-500",

      )}

      title={title}

    >

      <span

        className={cn(

          "inline-flex items-center gap-1 text-[9px]",

          highlight && active

            ? "text-emerald-700"

            : active

              ? "text-primary/70"

              : "text-slate-500",

        )}

      >

        {Icon ? <Icon className="size-2.5" /> : null}

        {label}

      </span>

      <span className="max-w-[7rem] truncate text-xs tabular-nums normal-case">

        {value}

      </span>

    </span>

  );

}

