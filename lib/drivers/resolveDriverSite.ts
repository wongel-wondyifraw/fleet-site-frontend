import type { ApiDriver, ApiSite, ApiVehicle } from "@/lib/api/types";
import { findSite } from "@/lib/trips/resolveTripStart";

/** Site name for a driver, derived from their assigned vehicle's site. */
export function driverSiteName(
  driver: ApiDriver,
  vehicleById: Map<string, ApiVehicle>,
  sites: ApiSite[],
): string | null {
  if (!driver.assignedVehicleId) return null;
  const vehicle = vehicleById.get(driver.assignedVehicleId);
  if (!vehicle?.assignedSite) return null;
  return findSite(sites, vehicle.assignedSite)?.name ?? null;
}

/** Site name from a vehicle record, if the vehicle has an assigned site. */
export function vehicleSiteName(
  vehicle: ApiVehicle | null | undefined,
  sites: ApiSite[],
): string | null {
  if (!vehicle?.assignedSite) return null;
  return findSite(sites, vehicle.assignedSite)?.name ?? null;
}
