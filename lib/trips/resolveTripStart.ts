import type { ApiDriver, ApiSite, ApiVehicle } from "@/lib/api/types";

/** Match a site by UUID or by name (case-insensitive). */
export function findSite(
  sites: ApiSite[],
  idOrName: string,
): ApiSite | undefined {
  const needle = idOrName.trim().toLowerCase();
  return sites.find(
    (site) =>
      site.id === idOrName ||
      site.name.trim().toLowerCase() === needle,
  );
}

export function formatSiteLocation(site: ApiSite): string {
  return [site.address, site.city, site.state].filter(Boolean).join(", ");
}

export function siteToStartFields(site: ApiSite) {
  return {
    startAddress: site.address,
    startCity: site.city,
    startState: site.state,
    startLat: null as number | null,
    startLon: null as number | null,
  };
}

/** Pick the best start site from the selected vehicle or driver assignment. */
export function resolvePrimarySite(
  driver: ApiDriver | null | undefined,
  vehicle: ApiVehicle | null | undefined,
  sites: ApiSite[],
): ApiSite | null {
  if (vehicle?.siteId) {
    const fromVehicle = findSite(sites, vehicle.siteId);
    if (fromVehicle) return fromVehicle;
  }
  if (driver?.siteId) {
    return findSite(sites, driver.siteId) ?? null;
  }
  return null;
}
