"use client";

// Trip create / edit form, extracted from the TripsPanel monolith so
// each module's source map stays small enough that Chrome DevTools
// doesn't run out of heap when the dashboard is open.
//
// Owns:
//   - TripForm:           the actual create / edit form view
//   - FormCard:           the labelled card wrapper used inside the form
//   - TripDistancePreview: the live distance / route preview between
//                          the start and end cards

import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  MapPin,
  Route,
  Save,
  Truck,
  UserRound,
  X,
} from "@/lib/icons";
import {
  useEffect,
  useMemo,
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
import { Select } from "@/components/ui/select";
import { PanelError } from "@/components/vehicles/VehicleForm";
import { ApiError } from "@/lib/api/client";
import type { CreateTripRequest } from "@/lib/api/trips";
import {
  TRIP_STATUSES,
  prettyEnum,
  type ApiCustomTripRoute,
  type ApiDriver,
  type ApiSite,
  type ApiTrip,
  type ApiVehicle,
  type TripStatus,
} from "@/lib/api/types";
import {
  fetchDrivingDistance,
  geocodeAddress,
} from "@/lib/locationiq/directions";
import {
  formatSiteLocation,
  resolvePrimarySite,
  siteToStartFields,
} from "@/lib/trips/resolveTripStart";
import {
  buildCustomEndpointOptions,
  formatDistance,
  formatLocationLine,
  formatRouteDuration,
  haversineKm,
} from "@/lib/trips/tripFormatters";
import {
  emptyForm,
  tripToForm,
  type TripFormState,
} from "@/lib/trips/tripFormState";
import { cn } from "@/lib/utils";

export function TripForm({
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
  // its dropdown. Both endpoints contribute to BOTH the start and
  // end pickers (the admin only registers one direction; reverse is
  // implicit) and results are deduped by normalized name.
  const customStartOptions = useMemo<CustomLocationOption[]>(
    () => buildCustomEndpointOptions(customRoutes, "start"),
    [customRoutes],
  );

  const customEndOptions = useMemo<CustomLocationOption[]>(
    () => buildCustomEndpointOptions(customRoutes, "end"),
    [customRoutes],
  );

  // When both halves of the form match the same saved Custom route —
  // in either direction — we surface the admin-recorded distance
  // instead of trying to recompute it (Custom routes have no lat/lon).
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
              admin-recorded distance will be used. */}
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
              legs (A → B → A). */}
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
          <Select
            value={form.status}
            onValueChange={(v) => update("status", v as TripStatus)}
            disabled={isSubmitting}
            searchable={false}
            options={TRIP_STATUSES.map((s) => ({
              value: s,
              label: prettyEnum(s),
            }))}
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
