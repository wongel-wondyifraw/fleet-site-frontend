// API wrappers for the /trips resource. Used by the Trip Management page.
import { apiRequest } from "@/lib/api/client";
import type { PageResponse } from "@/lib/api/pagination";
import { fetchAllPages } from "@/lib/api/pagination";
import type {
  ApiTrip,
  ApiTripTargetEffective,
  TripStatus,
} from "@/lib/api/types";

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
  isRoundTrip?: boolean;
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
  /** YYYY-MM-DD effective trip date (single day). */
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  timezone?: string;
  includeTarget?: boolean;
  siteId?: string;
  limit?: number;
  cursor?: string;
}

export interface TripsListMeta {
  targetForDate?: ApiTripTargetEffective;
}

export type TripsPageResponse = PageResponse<ApiTrip, TripsListMeta>;

function buildTripsQuery(query: ListTripsQuery): string {
  const params = new URLSearchParams();
  if (query.vehicleId) params.set("vehicleId", query.vehicleId);
  if (query.driverId) params.set("driverId", query.driverId);
  if (query.status) params.set("status", query.status);
  if (query.date) params.set("date", query.date);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  if (query.timezone) params.set("timezone", query.timezone);
  if (query.includeTarget) params.set("includeTarget", "true");
  if (query.siteId) params.set("siteId", query.siteId);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function listTripsPage(
  query: ListTripsQuery = {},
): Promise<TripsPageResponse> {
  return apiRequest<TripsPageResponse>(`/trips${buildTripsQuery(query)}`);
}

/** Loads all pages for the given query (use scoped date/status filters). */
export async function listTrips(query: ListTripsQuery = {}): Promise<ApiTrip[]> {
  return fetchAllPages<ApiTrip, TripsListMeta>((cursor) =>
    listTripsPage({ ...query, cursor, limit: query.limit ?? 100 }),
  );
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

export async function setTripStatus(
  id: string,
  status: TripStatus,
  options: { distanceKm?: number | null } = {},
): Promise<ApiTrip> {
  const body: Record<string, unknown> = { status };
  if (typeof options.distanceKm === "number") {
    body.distanceKm = options.distanceKm;
  }
  return apiRequest<ApiTrip>(`/trips/${id}/status`, {
    method: "PATCH",
    body,
  });
}
