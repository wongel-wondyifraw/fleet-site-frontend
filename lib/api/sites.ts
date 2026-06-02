// API wrappers for the /sites resource. Used by SitesPanel (CRUD) and the
// user-management form (assignment dropdown).
import { apiRequest } from "@/lib/api/client";
import type { ApiSite, SiteStatus, SiteType } from "@/lib/api/types";

// Alias kept so existing imports (UserManagementPanel) don't break.
export type ListedSite = ApiSite;

// Body for POST /sites. Mirrors backend CreateSiteDto.
export interface CreateSiteRequest {
  name: string;
  type: SiteType;
  // Optional - backend defaults to PLANNING when omitted.
  status?: SiteStatus;
  address: string;
  city: string;
  state: string;
  // Optional list of user UUIDs to assign to this site on creation.
  userIds?: string[];
}

// Body for PATCH /sites/:id. Mirrors backend UpdateSiteDto.
// All fields optional; passing `userIds: []` clears the assignments,
// omitting it leaves the existing assignments untouched.
export type UpdateSiteRequest = Partial<CreateSiteRequest>;

// GET /sites - returns the full list.
export async function listSites(): Promise<ApiSite[]> {
  return apiRequest<ApiSite[]>("/sites");
}

// GET /sites/:id - returns a single site with assignees.
export async function getSite(id: string): Promise<ApiSite> {
  return apiRequest<ApiSite>(`/sites/${id}`);
}

// POST /sites - admin creates a new site.
export async function createSite(body: CreateSiteRequest): Promise<ApiSite> {
  return apiRequest<ApiSite>("/sites", { method: "POST", body });
}

// PATCH /sites/:id - update mutable fields.
export async function updateSite(
  id: string,
  body: UpdateSiteRequest,
): Promise<ApiSite> {
  return apiRequest<ApiSite>(`/sites/${id}`, { method: "PATCH", body });
}

// DELETE /sites/:id - hard-delete on the backend.
export async function deleteSite(id: string): Promise<void> {
  return apiRequest<void>(`/sites/${id}`, { method: "DELETE" });
}
