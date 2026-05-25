// API wrappers for the /vehicles resource. Used by the VehicleRegistry page
// (list, create, update, delete) and by anywhere we need vehicle metadata.
import { apiRequest } from "@/lib/api/client";
import type {
  ApiVehicle,
  FuelType,
  VehicleStatus,
  VehicleType,
} from "@/lib/api/types";

// Body for POST /vehicles. Mirrors backend CreateVehicleDto.
// The asset number is server-generated, so it is NOT part of the request.
export interface CreateVehicleRequest {
  plateNumber: string;
  type: VehicleType;
  fuelType: FuelType;
  fuelCapacity: number;
  // Fuel economy in km/L. Optional - defaults to 0 server-side.
  mileage?: number;
  currentOdometer?: number;
  // Pass the site UUID; backend stores it on Vehicle.assignedSite.
  assignedSite?: string | null;
}

// Body for PATCH /vehicles/:id. All fields optional.
export type UpdateVehicleRequest = Partial<CreateVehicleRequest> & {
  status?: VehicleStatus;
};

// Optional query filters for GET /vehicles.
export interface ListVehiclesQuery {
  status?: VehicleStatus;
  type?: VehicleType;
  // Filter by assigned site UUID.
  site?: string;
}

// GET /vehicles - returns the full list, with optional filters appended.
export async function listVehicles(
  query: ListVehiclesQuery = {},
): Promise<ApiVehicle[]> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.type) params.set("type", query.type);
  if (query.site) params.set("site", query.site);
  const qs = params.toString();
  return apiRequest<ApiVehicle[]>(`/vehicles${qs ? `?${qs}` : ""}`);
}

// GET /vehicles/:id - returns a single vehicle record. The detail page
// re-fetches on mount so a deep-link / refresh still shows live data.
export async function getVehicle(id: string): Promise<ApiVehicle> {
  return apiRequest<ApiVehicle>(`/vehicles/${id}`);
}

// POST /vehicles - register a new vehicle. Returns the persisted record.
export async function createVehicle(
  body: CreateVehicleRequest,
): Promise<ApiVehicle> {
  return apiRequest<ApiVehicle>("/vehicles", { method: "POST", body });
}

// PATCH /vehicles/:id - update mutable fields on an existing vehicle.
export async function updateVehicle(
  id: string,
  body: UpdateVehicleRequest,
): Promise<ApiVehicle> {
  return apiRequest<ApiVehicle>(`/vehicles/${id}`, { method: "PATCH", body });
}

// DELETE /vehicles/:id - hard-delete on the backend.
export async function deleteVehicle(id: string): Promise<void> {
  return apiRequest<void>(`/vehicles/${id}`, { method: "DELETE" });
}
