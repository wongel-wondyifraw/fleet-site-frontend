// API wrappers for the /users resource on the backend.
import { apiRequest } from "@/lib/api/client";
import type { PageResponse } from "@/lib/api/pagination";
import { fetchAllPages } from "@/lib/api/pagination";
import type { ApiUser, UserRole } from "@/lib/api/types";

// Body for POST /users when creating a new account from the admin UI.
export interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  // Optional list of site UUIDs to assign on creation.
  siteIds?: string[];
}

// Body for PATCH /users/:id. All fields optional; only changed ones are sent.
// Role and site assignments have their own endpoints (see below) but we keep
// this DTO aligned with backend `UpdateUserDto`.
export interface UpdateUserRequest {
  email?: string;
  firstName?: string;
  lastName?: string;
  // Flipping this true reactivates a previously soft-deleted user; false has
  // the same effect as DELETE /users/:id.
  isActive?: boolean;
}

// Optional filters for GET /users; mirrors backend UserQueryDto.
export interface ListUsersQuery {
  role?: UserRole;
  siteId?: string;
  isActive?: boolean;
  search?: string;
  expand?: string;
  limit?: number;
  cursor?: string;
}

function buildUsersQuery(query: ListUsersQuery): string {
  const params = new URLSearchParams();
  if (query.role) params.set("role", query.role);
  if (query.siteId) params.set("siteId", query.siteId);
  if (typeof query.isActive === "boolean")
    params.set("isActive", String(query.isActive));
  if (query.search) params.set("search", query.search);
  if (query.expand) params.set("expand", query.expand);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function listUsersPage(
  query: ListUsersQuery = {},
): Promise<PageResponse<ApiUser>> {
  return apiRequest<PageResponse<ApiUser>>(`/users${buildUsersQuery(query)}`);
}

export async function listUsers(query: ListUsersQuery = {}): Promise<ApiUser[]> {
  return fetchAllPages((cursor) =>
    listUsersPage({ ...query, cursor, limit: query.limit ?? 100 }),
  );
}

// GET /users/:id - fetch a single user with site assignments eager-loaded.
export async function getUser(id: string): Promise<ApiUser> {
  return apiRequest<ApiUser>(`/users/${id}`);
}

// POST /users - admin creates a new user; returns the persisted record.
export async function createUser(body: CreateUserRequest): Promise<ApiUser> {
  return apiRequest<ApiUser>("/users", { method: "POST", body });
}

// PATCH /users/:id - update mutable profile fields (name, email, isActive).
export async function updateUser(
  id: string,
  body: UpdateUserRequest,
): Promise<ApiUser> {
  return apiRequest<ApiUser>(`/users/${id}`, { method: "PATCH", body });
}

// PATCH /users/:id/role - dedicated endpoint for role changes (kept separate
// from the generic update for auditability on the backend).
export async function setUserRole(id: string, role: UserRole): Promise<ApiUser> {
  return apiRequest<ApiUser>(`/users/${id}/role`, {
    method: "PATCH",
    body: { role },
  });
}

// PUT /users/:id/sites - replace the user's entire site assignment set. Pass
// an empty array to clear all assignments.
export async function assignUserSites(
  id: string,
  siteIds: string[],
): Promise<ApiUser> {
  return apiRequest<ApiUser>(`/users/${id}/sites`, {
    method: "PUT",
    body: { siteIds },
  });
}

// PATCH /users/:id/password - admin password reset (no current password
// required; backend gates this to ADMIN role).
export async function resetUserPassword(
  id: string,
  newPassword: string,
): Promise<void> {
  return apiRequest<void>(`/users/${id}/password`, {
    method: "PATCH",
    body: { newPassword },
  });
}

// DELETE /users/:id - soft-delete (isActive=false) on the backend.
export async function deactivateUser(id: string): Promise<void> {
  return apiRequest<void>(`/users/${id}`, { method: "DELETE" });
}

// Convenience: flip `isActive` back to true via the generic update endpoint.
// The backend has no dedicated "reactivate" route, so we use PATCH /users/:id.
export async function reactivateUser(id: string): Promise<ApiUser> {
  return updateUser(id, { isActive: true });
}
