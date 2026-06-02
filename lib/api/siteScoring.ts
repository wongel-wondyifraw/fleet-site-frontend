import { apiRequest } from "@/lib/api/client";
import type { ApiSiteScoringConfig } from "@/lib/api/types";

export async function getSiteScoringConfig(): Promise<ApiSiteScoringConfig> {
  return apiRequest<ApiSiteScoringConfig>("/sites/scoring/config");
}

export async function updateSiteScoringConfig(
  body: ApiSiteScoringConfig,
): Promise<ApiSiteScoringConfig> {
  return apiRequest<ApiSiteScoringConfig>("/sites/scoring/config", {
    method: "PUT",
    body,
  });
}
