// API wrappers for the /trips resource. Used by the Trip Management page.
import { apiRequest } from "@/lib/api/client";
import type { ApiTrip, TripStatus } from "@/lib/api/types";

export interface CreateTripRequest {
  vehicleId: string;
  driverId?: string;
  status?: TripStatus;
  startAddress: string;
  startCity?: string;
  startState?: string;
  startLat?: number;
  startLon?: number;
  endAddress: string;
  endCity?: string;
  endState?: string;
  endLat?: number;
  endLon?: number;
  scheduledAt?: string;
  notes?: string;
}

export type UpdateTripRequest = Partial<CreateTripRequest> & {
  driverId?: string | null;
  scheduledAt?: string | null;
  notes?: string | null;
};

export interface ListTripsQuery {
  vehicleId?: string;
  driverId?: string;
  status?: TripStatus;
}

export async function listTrips(
  query: ListTripsQuery = {},
): Promise<ApiTrip[]> {
  const params = new URLSearchParams();
  if (query.vehicleId) params.set("vehicleId", query.vehicleId);
  if (query.driverId) params.set("driverId", query.driverId);
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return apiRequest<ApiTrip[]>(`/trips${qs ? `?${qs}` : ""}`);
}

export async function getTrip(id: string): Promise<ApiTrip> {
  return apiRequest<ApiTrip>(`/trips/${id}`);
}

export async function createTrip(body: CreateTripRequest): Promise<ApiTrip> {
  return apiRequest<ApiTrip>("/trips", { method: "POST", body });
}

export async function updateTrip(
  id: string,
  body: UpdateTripRequest,
): Promise<ApiTrip> {
  return apiRequest<ApiTrip>(`/trips/${id}`, { method: "PATCH", body });
}

export async function deleteTrip(id: string): Promise<void> {
  return apiRequest<void>(`/trips/${id}`, { method: "DELETE" });
}

// PATCH /trips/:id/status — used by the row action buttons (Trip Checkout /
// Check-in / Cancel). Lives separate from updateTrip so the start/complete
// timestamp side-effects are explicit.
export async function setTripStatus(
  id: string,
  status: TripStatus,
): Promise<ApiTrip> {
  return apiRequest<ApiTrip>(`/trips/${id}/status`, {
    method: "PATCH",
    body: { status },
  });
}
