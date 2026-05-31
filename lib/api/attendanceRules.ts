import { apiRequest } from "@/lib/api/client";
import type { ApiAttendanceRules } from "@/lib/api/types";

export async function getAttendanceRules(
  signal?: AbortSignal,
): Promise<ApiAttendanceRules> {
  return apiRequest<ApiAttendanceRules>("/attendance-rules", { signal });
}

export async function updateAttendanceRules(
  next: ApiAttendanceRules,
): Promise<ApiAttendanceRules> {
  return apiRequest<ApiAttendanceRules>("/attendance-rules", {
    method: "PUT",
    body: next,
  });
}
