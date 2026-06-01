// API wrappers for the /fuel/consumption roster endpoints. Used by the
// Fuel Management page to render per-driver daily consumption estimates
// derived from attendance odometer distance and vehicle rated km/L.
import { apiRequest } from "@/lib/api/client";
import type { ApiDriver, ApiFuelConsumptionDay } from "@/lib/api/types";

export interface ListFuelConsumptionRosterQuery {
  /** YYYY-MM-DD calendar day. */
  date: string;
  siteId: string;
  search?: string;
}

export async function listFuelConsumptionRoster(
  query: ListFuelConsumptionRosterQuery,
): Promise<ApiFuelConsumptionDay[]> {
  const params = new URLSearchParams();
  params.set("date", query.date);
  params.set("siteId", query.siteId);
  if (query.search) params.set("search", query.search);
  return apiRequest<ApiFuelConsumptionDay[]>(
    `/fuel/consumption/roster?${params.toString()}`,
  );
}

export interface ListFuelConsumptionRosterBulkQuery {
  date: string;
  siteIds: string[];
  search?: string;
}

export async function listFuelConsumptionRosterBulk(
  query: ListFuelConsumptionRosterBulkQuery,
): Promise<{ bySite: Record<string, ApiFuelConsumptionDay[]> }> {
  const params = new URLSearchParams();
  params.set("date", query.date);
  params.set("siteIds", query.siteIds.join(","));
  if (query.search) params.set("search", query.search);
  return apiRequest<{ bySite: Record<string, ApiFuelConsumptionDay[]> }>(
    `/fuel/consumption/roster/bulk?${params.toString()}`,
  );
}

export interface DriverFuelHistory {
  driver: ApiDriver | null;
  days: ApiFuelConsumptionDay[];
}

export async function getDriverFuelHistory(
  driverId: string,
  range: { from: string; to: string },
): Promise<DriverFuelHistory> {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  return apiRequest<DriverFuelHistory>(
    `/fuel/consumption/drivers/${driverId}/history?${params.toString()}`,
  );
}
