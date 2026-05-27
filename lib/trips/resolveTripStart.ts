import type { ApiDriver, ApiSite, ApiVehicle } from "@/lib/api/types";

/** Match a site by UUID (vehicle.assignedSite) or by name (driver.homeSite). */
export function findSite(
  sites: ApiSite[],
  key: string | null | undefined,
): ApiSite | undefined {
  if (!key?.trim()) return undefined;
  const trimmed = key.trim();
  return (
    sites.find((s) => s.id === trimmed) ??
    sites.find((s) => s.name === trimmed)
  );
}

/** Driver assigned to this vehicle, if any. */
export function findDriverForVehicle(
  drivers: ApiDriver[],
  vehicleId: string,
): ApiDriver | undefined {
  return drivers.find((d) => d.assignedVehicleId === vehicleId);
}

/**
 * Primary departure site: driver's assigned site first, then the vehicle's
 * assigned site when the driver has none.
 */
export function resolvePrimarySite(
  driver: ApiDriver | null | undefined,
  vehicle: ApiVehicle | null | undefined,
  sites: ApiSite[],
): ApiSite | undefined {
  if (driver?.homeSite) {
    const fromDriver = findSite(sites, driver.homeSite);
    if (fromDriver) return fromDriver;
  }
  if (vehicle?.assignedSite) {
    return findSite(sites, vehicle.assignedSite);
  }
  return undefined;
}

export type StartLocationFields = {
  startAddress: string;
  startCity: string;
  startState: string;
  startLat: number | null;
  startLon: number | null;
};

export function siteToStartFields(site: ApiSite): StartLocationFields {
  return {
    startAddress: site.address,
    startCity: site.city,
    startState: site.state,
    startLat: null,
    startLon: null,
  };
}

export function formatSiteLocation(site: ApiSite): string {
  return [site.address, site.city, site.state].filter(Boolean).join(", ");
}
