// API wrappers for the /drivers resource.
import { apiRequest } from "@/lib/api/client";
import type { PageResponse } from "@/lib/api/pagination";
import type { ApiDriver, DriverStatus, LicenseClass } from "@/lib/api/types";

export interface CreateDriverRequest {
  firstName: string;
  lastName: string;
  licenseNumber: string;
  licenseClass: LicenseClass;
  licenseExpiry: string;
  phoneNumber: string;
  email?: string;
  hireDate: string;
  assignedVehicleId?: string;
  siteId?: string;
  notes?: string;
}

export interface ListDriversQuery {
  status?: DriverStatus;
  licenseClass?: LicenseClass;
  siteId?: string;
  search?: string;
  limit?: number;
  cursor?: string;
}

export type DriverLookup = Pick<
  ApiDriver,
  | "id"
  | "firstName"
  | "lastName"
  | "employeeId"
  | "licenseNumber"
  | "licenseClass"
  | "licenseExpiry"
  | "phoneNumber"
  | "email"
  | "hireDate"
  | "assignedVehicleId"
  | "status"
  | "siteId"
>;

function buildDriversQuery(query: ListDriversQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.licenseClass) params.set("licenseClass", query.licenseClass);
  if (query.siteId) params.set("siteId", query.siteId);
  if (query.search) params.set("search", query.search);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function listDriversPage(
  query: ListDriversQuery = {},
): Promise<PageResponse<ApiDriver>> {
  return apiRequest<PageResponse<ApiDriver>>(`/drivers${buildDriversQuery(query)}`);
}

export async function listDriversLookup(): Promise<DriverLookup[]> {
  return apiRequest<DriverLookup[]>("/drivers/lookup");
}

export async function createDriver(
  body: CreateDriverRequest,
): Promise<ApiDriver> {
  return apiRequest<ApiDriver>("/drivers", { method: "POST", body });
}

export interface UpdateDriverRequest {
  firstName?: string;
  lastName?: string;
  licenseNumber?: string;
  licenseClass?: LicenseClass;
  licenseExpiry?: string;
  phoneNumber?: string;
  email?: string | null;
  status?: DriverStatus;
  assignedVehicleId?: string | null;
  siteId?: string | null;
  notes?: string | null;
}

export async function getDriver(id: string): Promise<ApiDriver> {
  return apiRequest<ApiDriver>(`/drivers/${id}`);
}

export async function updateDriver(
  id: string,
  body: UpdateDriverRequest,
): Promise<ApiDriver> {
  return apiRequest<ApiDriver>(`/drivers/${id}`, { method: "PATCH", body });
}

export async function deleteDriver(id: string): Promise<void> {
  return apiRequest<void>(`/drivers/${id}`, { method: "DELETE" });
}

export async function listExpiringLicenses(
  withinDays = 30,
): Promise<ApiDriver[]> {
  return apiRequest<ApiDriver[]>(
    `/drivers/expiring-licenses?withinDays=${withinDays}`,
  );
}

export async function assignDriverVehicle(
  driverId: string,
  vehicleId: string,
): Promise<ApiDriver> {
  return apiRequest<ApiDriver>(`/drivers/${driverId}/assign-vehicle`, {
    method: "PATCH",
    body: { vehicleId },
  });
}

export async function unassignDriverVehicle(
  driverId: string,
): Promise<ApiDriver> {
  return apiRequest<ApiDriver>(`/drivers/${driverId}/assign-vehicle`, {
    method: "DELETE",
  });
}
