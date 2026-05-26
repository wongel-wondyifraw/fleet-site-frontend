// API wrappers for the /drivers resource. Used by the VehicleRegistry page
// to search/select drivers and register new ones inline, and by the Drivers
// Management page for full CRUD.
import { apiRequest } from "@/lib/api/client";
import type { ApiDriver, DriverStatus, LicenseClass } from "@/lib/api/types";

// Body for POST /drivers. Mirrors backend CreateDriverDto. Dates are sent
// as ISO date strings (YYYY-MM-DD) - the backend wraps them in Date objects.
// Note: employeeId is NOT part of this payload - the backend issues it
// (EMP-001, EMP-002, ...) in the same way it does for vehicle asset numbers.
export interface CreateDriverRequest {
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

// Body for PATCH /drivers/:id. Every field is optional - omit a field to leave
// it untouched. Mirrors backend UpdateDriverDto.
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
  homeSite?: string | null;
  notes?: string | null;
}

// GET /drivers/:id - fetch a single driver (with assigned vehicle joined in).
export async function getDriver(id: string): Promise<ApiDriver> {
  return apiRequest<ApiDriver>(`/drivers/${id}`);
}

// PATCH /drivers/:id - update mutable fields. Returns the updated record.
export async function updateDriver(
  id: string,
  body: UpdateDriverRequest,
): Promise<ApiDriver> {
  return apiRequest<ApiDriver>(`/drivers/${id}`, { method: "PATCH", body });
}

// DELETE /drivers/:id - hard-delete on the backend (204 No Content).
export async function deleteDriver(id: string): Promise<void> {
  return apiRequest<void>(`/drivers/${id}`, { method: "DELETE" });
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
