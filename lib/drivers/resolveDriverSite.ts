import type { ApiSite, ApiVehicle } from "@/lib/api/types";

function findSite(sites: ApiSite[], idOrName: string): ApiSite | undefined {
  const needle = idOrName.trim().toLowerCase();
  return sites.find(
    (site) =>
      site.id === idOrName ||
      site.name.trim().toLowerCase() === needle,
  );
}

type DriverSiteInput = {
  siteId?: string | null;
  assignedVehicleId?: string | null;
  assignedVehicle?: ApiVehicle | null;
};

function resolveDriverVehicle(
  driver: DriverSiteInput,
  vehicleById?: Map<string, ApiVehicle>,
): ApiVehicle | null {
  if (driver.assignedVehicle) return driver.assignedVehicle;
  if (driver.assignedVehicleId && vehicleById) {
    return vehicleById.get(driver.assignedVehicleId) ?? null;
  }
  return null;
}

/** Resolve a driver's home site name from `siteId` or assigned vehicle. */
export function driverSiteName(
  driver: DriverSiteInput,
  sites: ApiSite[],
): string | null;
export function driverSiteName(
  driver: DriverSiteInput,
  vehicleById: Map<string, ApiVehicle>,
  sites: ApiSite[],
): string | null;
export function driverSiteName(
  driver: DriverSiteInput,
  sitesOrVehicleById: ApiSite[] | Map<string, ApiVehicle>,
  maybeSites?: ApiSite[],
): string | null {
  const sites = maybeSites ?? (sitesOrVehicleById as ApiSite[]);
  const vehicleById = maybeSites
    ? (sitesOrVehicleById as Map<string, ApiVehicle>)
    : undefined;

  if (driver.siteId) {
    return findSite(sites, driver.siteId)?.name ?? null;
  }
  const vehicle = resolveDriverVehicle(driver, vehicleById);
  if (!vehicle?.siteId) return null;
  return findSite(sites, vehicle.siteId)?.name ?? null;
}

/** Resolve a driver's home site id from explicit assignment or vehicle. */
export function driverSiteId(
  driver: { siteId?: string | null; assignedVehicle?: ApiVehicle | null },
): string | null {
  if (driver.siteId) return driver.siteId;
  return driver.assignedVehicle?.siteId ?? null;
}

export function vehicleSiteName(
  vehicle: ApiVehicle | null | undefined,
  sites: ApiSite[],
): string | null {
  if (!vehicle?.siteId) return null;
  return findSite(sites, vehicle.siteId)?.name ?? null;
}
