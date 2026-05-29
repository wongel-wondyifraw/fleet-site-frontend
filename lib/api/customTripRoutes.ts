// API wrappers for the /custom-trip-routes resource. Powers the
// Settings -> Trip Settings panel (CRUD) and the Trip-creation
// pickers that surface saved start / end pairs as "Custom" presets.
import { apiRequest } from "@/lib/api/client";
import type { ApiCustomTripRoute } from "@/lib/api/types";

// Body for POST /custom-trip-routes. Mirrors backend CreateCustomTripRouteDto.
export interface CreateCustomTripRouteRequest {
  startName: string;
  // City / state are accepted by the backend but never collected
  // directly from the user — the settings form omits them and the
  // trip-creation autocomplete forwards them silently when present.
  startCity?: string;
  startState?: string;
  endName: string;
  endCity?: string;
  endState?: string;
  distanceKm: number;
}

// Body for PATCH /custom-trip-routes/:id — all fields optional so the
// panel form can send a partial diff (or a full object, which is fine
// because every field is allowed).
export type UpdateCustomTripRouteRequest = Partial<CreateCustomTripRouteRequest>;

export async function listCustomTripRoutes(): Promise<ApiCustomTripRoute[]> {
  return apiRequest<ApiCustomTripRoute[]>("/custom-trip-routes");
}

export async function createCustomTripRoute(
  body: CreateCustomTripRouteRequest,
): Promise<ApiCustomTripRoute> {
  return apiRequest<ApiCustomTripRoute>("/custom-trip-routes", {
    method: "POST",
    body,
  });
}

export async function updateCustomTripRoute(
  id: string,
  body: UpdateCustomTripRouteRequest,
): Promise<ApiCustomTripRoute> {
  return apiRequest<ApiCustomTripRoute>(`/custom-trip-routes/${id}`, {
    method: "PATCH",
    body,
  });
}

export async function deleteCustomTripRoute(id: string): Promise<void> {
  return apiRequest<void>(`/custom-trip-routes/${id}`, { method: "DELETE" });
}
