import { apiRequest } from "@/lib/api/client";
import type { ApiSiteHealthScore } from "@/lib/api/types";

export type ApiSiteHealthOverviewRow = {
  siteId: string;
  current: ApiSiteHealthScore | null;
  history: ApiSiteHealthScore[];
};

export async function listSiteHealthOverview(
  date: string,
  siteIds?: string[],
  historyDays = 7,
): Promise<ApiSiteHealthOverviewRow[]> {
  const params = new URLSearchParams({ date, historyDays: String(historyDays) });
  if (siteIds && siteIds.length > 0) {
    params.set("siteIds", siteIds.join(","));
  }
  return apiRequest<ApiSiteHealthOverviewRow[]>(
    `/sites/health/overview?${params.toString()}`,
  );
}

export async function listSiteHealth(
  date: string,
  siteIds?: string[],
): Promise<ApiSiteHealthScore[]> {
  const params = new URLSearchParams({ date });
  if (siteIds && siteIds.length > 0) {
    params.set("siteIds", siteIds.join(","));
  }
  return apiRequest<ApiSiteHealthScore[]>(`/sites/health?${params.toString()}`);
}

export async function listSiteHealthHistory(
  siteId: string,
  from: string,
  to: string,
): Promise<ApiSiteHealthScore[]> {
  const params = new URLSearchParams({ from, to });
  return apiRequest<ApiSiteHealthScore[]>(
    `/sites/health/${siteId}/history?${params.toString()}`,
  );
}
