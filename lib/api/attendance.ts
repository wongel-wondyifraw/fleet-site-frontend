// API wrappers for the event-log /attendance/roster endpoints. Used by the
// Attendance Management page to render the per-site daily roster, record
// punches (DAY_IN / DAY_OUT / LUNCH / MAINT), correct punch times, and
// void punches when needed.
import { apiRequest } from "@/lib/api/client";
import type {
  ApiAttendanceDay,
  ApiDriver,
  AttendanceDayStatus,
  AttendancePunchType,
} from "@/lib/api/types";

// Query for GET /attendance/roster. The backend returns one row per driver
// rostered on `siteId` for `date`, lazily materialising AttendanceDay rows
// the first time the page is viewed for a given site/date.
export interface ListAttendanceRosterQuery {
  // YYYY-MM-DD calendar day.
  date: string;
  siteId: string;
  status?: AttendanceDayStatus;
  // Free-text match against the driver's name / employeeId.
  search?: string;
}

export async function listAttendanceRoster(
  query: ListAttendanceRosterQuery,
): Promise<ApiAttendanceDay[]> {
  const params = new URLSearchParams();
  params.set("date", query.date);
  params.set("siteId", query.siteId);
  if (query.status) params.set("status", query.status);
  if (query.search) params.set("search", query.search);
  return apiRequest<ApiAttendanceDay[]>(
    `/attendance/roster?${params.toString()}`,
  );
}

export interface ListAttendanceRosterBulkQuery {
  date: string;
  siteIds: string[];
  status?: AttendanceDayStatus;
  search?: string;
}

export async function listAttendanceRosterBulk(
  query: ListAttendanceRosterBulkQuery,
): Promise<{ bySite: Record<string, ApiAttendanceDay[]> }> {
  const params = new URLSearchParams();
  params.set("date", query.date);
  params.set("siteIds", query.siteIds.join(","));
  if (query.status) params.set("status", query.status);
  if (query.search) params.set("search", query.search);
  return apiRequest<{ bySite: Record<string, ApiAttendanceDay[]> }>(
    `/attendance/roster/bulk?${params.toString()}`,
  );
}

// Body for POST /attendance/days/:dayId/punches. `at` is optional — when
// omitted the backend stamps `new Date()` so the typical "punch now" flow
// doesn't need to send a timestamp. `odometer` (in kilometres) is captured
// alongside the punch on DAY_IN / DAY_OUT / LUNCH_OUT / LUNCH_IN so the
// backend can build the OdometerReading row and recompute work distance.
export interface CreateAttendancePunchRequest {
  type: AttendancePunchType;
  at?: string;
  note?: string;
  actorUserId?: string;
  odometer?: number;
}

export async function createAttendancePunch(
  dayId: string,
  body: CreateAttendancePunchRequest,
): Promise<ApiAttendanceDay> {
  return apiRequest<ApiAttendanceDay>(`/attendance/days/${dayId}/punches`, {
    method: "POST",
    body,
  });
}

// Body for PATCH /attendance/days/:dayId. Only EXPECTED / ON_LEAVE are
// settable directly — other statuses are derived from punches.
export interface UpdateAttendanceDayRequest {
  status?: Extract<AttendanceDayStatus, "EXPECTED" | "ON_LEAVE">;
  notes?: string | null;
}

export async function updateAttendanceDay(
  dayId: string,
  body: UpdateAttendanceDayRequest,
): Promise<ApiAttendanceDay> {
  return apiRequest<ApiAttendanceDay>(`/attendance/days/${dayId}`, {
    method: "PATCH",
    body,
  });
}

// Body for PATCH /attendance/punches/:punchId. Used by the correction
// dialog to fix punch times / notes after the fact.
export interface UpdateAttendancePunchRequest {
  at?: string;
  note?: string | null;
}

export async function updateAttendancePunch(
  punchId: string,
  body: UpdateAttendancePunchRequest,
): Promise<ApiAttendanceDay> {
  return apiRequest<ApiAttendanceDay>(`/attendance/punches/${punchId}`, {
    method: "PATCH",
    body,
  });
}

// DELETE /attendance/punches/:punchId. Soft-deletes (voids) the punch on
// the backend so the audit trail stays intact, and returns the recalculated
// day so the UI can refresh in-place.
export async function deleteAttendancePunch(
  punchId: string,
): Promise<ApiAttendanceDay> {
  return apiRequest<ApiAttendanceDay>(`/attendance/punches/${punchId}`, {
    method: "DELETE",
  });
}

// Response from GET /attendance/drivers/:driverId/history. `days` is the
// chronologically ordered list of AttendanceDay rows the driver has in the
// requested range (no lazy materialisation, so dates without a roster
// entry simply don't appear). The detail page derives all aggregate stats
// — absent days, late days, missed check-ins/outs, hours-per-day — from
// this array on the client so the "late after" threshold can stay
// configurable without another round-trip.
export interface DriverAttendanceHistory {
  driver: ApiDriver | null;
  days: ApiAttendanceDay[];
}

export async function getDriverAttendanceHistory(
  driverId: string,
  range: { from: string; to: string },
): Promise<DriverAttendanceHistory> {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  return apiRequest<DriverAttendanceHistory>(
    `/attendance/drivers/${driverId}/history?${params.toString()}`,
  );
}
