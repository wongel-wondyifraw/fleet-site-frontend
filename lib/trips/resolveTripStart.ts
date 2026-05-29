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
 * Primary departure site: taken from the assigned vehicle's site. Falls back
 * to the stored driver home site for legacy records without a vehicle link.
 */
export function resolvePrimarySite(
  driver: ApiDriver | null | undefined,
  vehicle: ApiVehicle | null | undefined,
  sites: ApiSite[],
): ApiSite | undefined {
  if (vehicle?.assignedSite) {
    const fromVehicle = findSite(sites, vehicle.assignedSite);
    if (fromVehicle) return fromVehicle;
  }
  if (driver?.homeSite) {
    return findSite(sites, driver.homeSite);
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
