import { apiRequest } from "@/lib/api/client";
import type { ApiTimeSettings } from "@/lib/api/types";

export async function getTimeSettings(
  signal?: AbortSignal,
): Promise<ApiTimeSettings> {
  return apiRequest<ApiTimeSettings>("/time-settings", { signal });
}

export async function updateTimeSettings(
  next: ApiTimeSettings,
): Promise<ApiTimeSettings> {
  return apiRequest<ApiTimeSettings>("/time-settings", {
    method: "PUT",
    body: next,
  });
}
