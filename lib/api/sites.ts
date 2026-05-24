// API wrappers for the /sites resource. Currently only the list endpoint is
// needed (for assigning sites during user creation).
import { apiRequest } from "@/lib/api/client";
import type { ApiSite } from "@/lib/api/types";

// Backend site shape includes more fields, but the UI only needs id/code/name.
// We loosen the type with Partial here so future additions stay compatible.
export interface ListedSite extends ApiSite {
  status?: string;
  city?: string;
}

// GET /sites - returns the full list. Admin-only on the backend.
export async function listSites(): Promise<ListedSite[]> {
  return apiRequest<ListedSite[]>("/sites");
}
