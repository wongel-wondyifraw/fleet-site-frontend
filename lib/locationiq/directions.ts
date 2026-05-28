// LocationIQ Directions (OSRM) client.
//
// Returns the *actual* driving distance between two coordinates by asking
// LocationIQ to compute a route, rather than the haversine straight-line
// approximation we used previously. Road distance is always >= great-
// circle distance, and the delta gets larger as the route winds around
// terrain / cities — so for trip planning a real route number is what
// the user expects to see.
//
// Docs: https://docs.locationiq.com/docs/directions-driving
//
// Behaviour:
//   - Returns kilometres rounded to the upstream API's precision.
//   - Caches identical lookups in-memory for the lifetime of the tab so
//     fiddling with form fields doesn't burn through the LocationIQ rate
//     limit (free tier = 2 req / sec).
//   - Aborts in-flight requests when the caller signals via AbortSignal.
//   - Returns null on any failure (no API key, network error, no route,
//     non-2xx). Callers should treat null as "unable to compute" and
//     fall back to the haversine straight-line value.

export interface DrivingDistanceResult {
  distanceKm: number;
  durationSec: number;
}

// Cache key = "lon1,lat1->lon2,lat2" with 6 decimal places (~11cm) which
// is plenty for distance computation and means we de-dupe lookups even
// when the user nudges a marker by a tiny amount. The round-trip
// variant is keyed separately so toggling the "Returns here" checkbox
// can never serve a stale one-way distance.
const cache = new Map<string, DrivingDistanceResult | null>();

function cacheKey(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  roundTrip: boolean,
): string {
  const fix = (n: number) => n.toFixed(6);
  const base = `${fix(startLon)},${fix(startLat)}->${fix(endLon)},${fix(endLat)}`;
  return roundTrip ? `${base}|rt` : base;
}

// Forward-geocode helper. Used when a flow populates an address from a
// source that doesn't carry coordinates (e.g. the assigned site for a
// driver/vehicle in the trip form), so the distance preview still has
// lat/lon to work with. Returns null on any failure so the caller can
// keep degrading gracefully.
export async function geocodeAddress(
  query: string,
  signal?: AbortSignal,
): Promise<{ lat: number; lon: number } | null> {
  const apiKey = process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY ?? "";
  if (!apiKey || !query.trim()) return null;

  const countryCodes = process.env.NEXT_PUBLIC_LOCATIONIQ_COUNTRY_CODES ?? "";
  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    format: "json",
    limit: "1",
    normalizeaddress: "1",
  });
  if (countryCodes) params.set("countrycodes", countryCodes);

  try {
    const res = await fetch(
      `https://us1.locationiq.com/v1/search?${params.toString()}`,
      { signal },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    if (!Array.isArray(json) || json.length === 0) return null;
    const top = json[0];
    if (!top?.lat || !top?.lon) return null;
    const lat = Number(top.lat);
    const lon = Number(top.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch (err) {
    if ((err as Error).name === "AbortError") return null;
    return null;
  }
}

export async function fetchDrivingDistance(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  signal?: AbortSignal,
  // When true, requests A → B → A from the routing API so the result's
  // distance/duration cover the full round trip in one call. The
  // returned `distance` field on OSRM responses is the sum of all legs,
  // so the caller doesn't need to double anything.
  roundTrip: boolean = false,
): Promise<DrivingDistanceResult | null> {
  const apiKey = process.env.NEXT_PUBLIC_LOCATIONIQ_API_KEY ?? "";
  if (!apiKey) return null;

  const key = cacheKey(startLat, startLon, endLat, endLon, roundTrip);
  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }

  // The OSRM-compatible endpoint expects {lon,lat};{lon,lat}. We disable
  // the geometry overview because we only need the summary metrics. For
  // a round trip we append the starting waypoint again so the response
  // reflects A → B → A as a single, summed route.
  const waypoints = roundTrip
    ? `${startLon},${startLat};${endLon},${endLat};${startLon},${startLat}`
    : `${startLon},${startLat};${endLon},${endLat}`;
  const url =
    `https://us1.locationiq.com/v1/directions/driving/` +
    `${waypoints}` +
    `?key=${encodeURIComponent(apiKey)}&overview=false&steps=false`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const json = (await res.json()) as {
      code?: string;
      routes?: Array<{ distance?: number; duration?: number }>;
    };
    if (json.code !== "Ok" || !json.routes || json.routes.length === 0) {
      cache.set(key, null);
      return null;
    }
    const route = json.routes[0];
    if (typeof route.distance !== "number") {
      cache.set(key, null);
      return null;
    }
    const result: DrivingDistanceResult = {
      distanceKm: route.distance / 1000,
      durationSec: route.duration ?? 0,
    };
    cache.set(key, result);
    return result;
  } catch (err) {
    // AbortError is expected when the user changes endpoints quickly;
    // don't cache the abort so the next attempt still hits the network.
    if ((err as Error).name === "AbortError") return null;
    cache.set(key, null);
    return null;
  }
}
