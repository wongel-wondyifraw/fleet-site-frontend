// API wrappers for the /drivers resource. Used by the VehicleRegistry page
// to search/select drivers and register new ones inline.
import { apiRequest } from "@/lib/api/client";
import type { ApiDriver, DriverStatus, LicenseClass } from "@/lib/api/types";

// Body for POST /drivers. Mirrors backend CreateDriverDto. Dates are sent
// as ISO date strings (YYYY-MM-DD) - the backend wraps them in Date objects.
export interface CreateDriverRequest {
  employeeId: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  licenseClass: LicenseClass;
  licenseExpiry: string;
  phoneNumber: string;
  email?: string;
  hireDate: string;
  // UUID of the vehicle to assign on creation. Optional.
  assignedVehicleId?: string;
  homeSite?: string;
  notes?: string;
}

// Optional query filters for GET /drivers.
export interface ListDriversQuery {
  status?: DriverStatus;
  licenseClass?: LicenseClass;
  site?: string;
  // Free-text match against name / employeeId / licenseNumber on the backend.
  search?: string;
}

// GET /drivers - returns the list, optionally filtered.
export async function listDrivers(
  query: ListDriversQuery = {},
): Promise<ApiDriver[]> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.licenseClass) params.set("licenseClass", query.licenseClass);
  if (query.site) params.set("site", query.site);
  if (query.search) params.set("search", query.search);
  const qs = params.toString();
  return apiRequest<ApiDriver[]>(`/drivers${qs ? `?${qs}` : ""}`);
}

// POST /drivers - register a new driver. Returns the persisted record.
export async function createDriver(
  body: CreateDriverRequest,
): Promise<ApiDriver> {
  return apiRequest<ApiDriver>("/drivers", { method: "POST", body });
}

// PATCH /drivers/:id/assign-vehicle - link a driver to a vehicle by ID.
export async function assignDriverVehicle(
  driverId: string,
  vehicleId: string,
): Promise<ApiDriver> {
  return apiRequest<ApiDriver>(`/drivers/${driverId}/assign-vehicle`, {
    method: "PATCH",
    body: { vehicleId },
  });
}

// DELETE /drivers/:id/assign-vehicle - clear the driver's vehicle assignment.
export async function unassignDriverVehicle(
  driverId: string,
): Promise<ApiDriver> {
  return apiRequest<ApiDriver>(`/drivers/${driverId}/assign-vehicle`, {
    method: "DELETE",
  });
}
