// Pure (non-React) helpers for trip rendering: distance / duration math,
// address line composition, and the matching logic that maps a trip back
// to an admin-defined Custom Trip Route.
//
// These were originally inlined inside `components/trips/TripsPanel.tsx`,
// but that file grew past 3,000 lines, which inflated dev-mode source
// maps enough to push the Chrome DevTools renderer toward its memory
// ceiling ("Approaching the memory limit" warning). Splitting them out
// keeps each module's source map manageable and unblocks DevTools.

import type { CustomLocationOption, PickedLocation } from "@/components/shared/LocationAutocomplete";
import {
  fetchDrivingDistance,
  geocodeAddress,
} from "@/lib/locationiq/directions";
import type {
  ApiCustomTripRoute,
  ApiTrip,
} from "@/lib/api/types";

// Joins address / city / state into a single human-friendly string,
// dropping empty pieces so we never render dangling commas.
export function formatLocationLine(
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
export function getTripEffectiveDate(trip: ApiTrip): Date | null {
  const iso =
    trip.completedAt ?? trip.startedAt ?? trip.scheduledAt ?? trip.createdAt;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Formats a Date as YYYY-MM-DD in the user's local timezone — matches
// the `<input type="date">` value format so the custom-date filter
// compares cleanly via string equality.
export function toLocalDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Maps a Trip back to a saved Custom Trip Route by matching the
// trip's start/end address line (case / whitespace-insensitive) in
// either direction. Lets a single A→B preset cover the B→A return
// trip without the admin having to register the inverse pairing.
//
// Returns null when no route lines up — including the obvious case
// where the caller hasn't loaded any custom routes yet.
export function findMatchingCustomRoute(
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
export function customRouteDistanceKm(
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
export function buildCustomEndpointOptions(
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
//   1. The matching saved Custom Trip Route's distance.
//   2. The persisted `trip.distanceKm` (set when the user checked in).
//   3. The haversine straight-line between saved start/end coords.
export function getTripDistanceKm(
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
//   2. Real driving distance from LocationIQ Directions.
//   3. Straight-line distance from any coords we can find.
//   4. null — give up rather than blocking the check-in indefinitely.
export async function resolveCheckinDistanceKm(
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
    // least carries something useful.
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
export function haversineKm(
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

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

// Formats the LocationIQ-reported route duration in seconds as a
// human-friendly approximation. Anything under an hour collapses to
// minutes; longer routes display as "Hh Mm".
export function formatRouteDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

// Formats a millisecond delta as HH:MM:SS, dropping the hours segment
// when the duration is under an hour so short trips read more naturally.
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}
