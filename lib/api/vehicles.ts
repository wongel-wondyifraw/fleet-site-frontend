// API wrappers for the /vehicles resource.
import { apiRequest } from "@/lib/api/client";
import type { PageResponse } from "@/lib/api/pagination";
import type {
  ApiVehicle,
  FuelType,
  VehicleStatus,
  VehicleType,
} from "@/lib/api/types";

export interface CreateVehicleRequest {
  plateNumber: string;
  type: VehicleType;
  fuelType: FuelType;
  fuelCapacity: number;
  mileage?: number;
  currentOdometer?: number;
  siteId?: string | null;
}

export type UpdateVehicleRequest = Partial<CreateVehicleRequest> & {
  status?: VehicleStatus;
};

export interface ListVehiclesQuery {
  status?: VehicleStatus;
  type?: VehicleType;
  siteId?: string;
  limit?: number;
  cursor?: string;
}

export type VehicleLookup = Pick<
  ApiVehicle,
  | "id"
  | "assetNumber"
  | "plateNumber"
  | "type"
  | "status"
  | "fuelType"
  | "fuelCapacity"
  | "mileage"
  | "currentOdometer"
  | "siteId"
>;

function buildVehiclesQuery(query: ListVehiclesQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.type) params.set("type", query.type);
  if (query.siteId) params.set("siteId", query.siteId);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function listVehiclesPage(
  query: ListVehiclesQuery = {},
): Promise<PageResponse<ApiVehicle>> {
  return apiRequest<PageResponse<ApiVehicle>>(
    `/vehicles${buildVehiclesQuery(query)}`,
  );
}

export async function listVehiclesLookup(): Promise<VehicleLookup[]> {
  return apiRequest<VehicleLookup[]>("/vehicles/lookup");
}

export async function getVehicle(id: string): Promise<ApiVehicle> {
  return apiRequest<ApiVehicle>(`/vehicles/${id}`);
}

export async function createVehicle(
  body: CreateVehicleRequest,
): Promise<ApiVehicle> {
  return apiRequest<ApiVehicle>("/vehicles", { method: "POST", body });
}

export async function updateVehicle(
  id: string,
  body: UpdateVehicleRequest,
): Promise<ApiVehicle> {
  return apiRequest<ApiVehicle>(`/vehicles/${id}`, { method: "PATCH", body });
}

export async function deleteVehicle(id: string): Promise<void> {
  return apiRequest<void>(`/vehicles/${id}`, { method: "DELETE" });
}
