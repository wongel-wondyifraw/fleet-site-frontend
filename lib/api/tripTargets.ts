// API wrappers for the /trip-targets resource. Drives the per-day
// "expected trips" donut and editor on the Trip Management page.
import { apiRequest } from "@/lib/api/client";
import type { ApiTripTargetEffective } from "@/lib/api/types";

// Fetch the effective target for a calendar day. `date` must be a
// YYYY-MM-DD string in the user's local timezone — matching the
// frontend's `toLocalDateKey` helper.
export async function getEffectiveTripTarget(
  date: string,
  signal?: AbortSignal,
): Promise<ApiTripTargetEffective> {
  const params = new URLSearchParams({ date });
  return apiRequest<ApiTripTargetEffective>(
    `/trip-targets/effective?${params.toString()}`,
    { signal },
  );
}

// Upsert a per-day override. Returns the new effective target so the
// caller can refresh local state in one round-trip.
export async function setTripTargetOverride(
  date: string,
  count: number,
): Promise<ApiTripTargetEffective> {
  const params = new URLSearchParams({ date });
  return apiRequest<ApiTripTargetEffective>(
    `/trip-targets/effective?${params.toString()}`,
    {
      method: "PUT",
      body: { count },
    },
  );
}

// Clear the per-day override, falling back to the global default.
export async function clearTripTargetOverride(
  date: string,
): Promise<ApiTripTargetEffective> {
  const params = new URLSearchParams({ date });
  return apiRequest<ApiTripTargetEffective>(
    `/trip-targets/effective?${params.toString()}`,
    { method: "DELETE" },
  );
}

// Default-target endpoints. Provided so a future settings panel can
// edit the global value; the trips UI itself only reads via
// `getEffectiveTripTarget`.
export async function getDefaultTripTarget(): Promise<{ count: number }> {
  return apiRequest<{ count: number }>("/trip-targets/default");
}

export async function setDefaultTripTarget(
  count: number,
): Promise<{ count: number }> {
  return apiRequest<{ count: number }>("/trip-targets/default", {
    method: "PUT",
    body: { count },
  });
}
