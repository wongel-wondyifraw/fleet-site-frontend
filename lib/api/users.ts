import { apiRequest } from "@/lib/api/client";
import type { PageResponse } from "@/lib/api/pagination";
import { fetchAllPages } from "@/lib/api/pagination";
import type { ApiUser } from "@/lib/api/types";

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleId: string;
  siteIds?: string[];
}

export interface UpdateUserRequest {
  email?: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
}

export interface ListUsersQuery {
  roleId?: string;
  siteId?: string;
  isActive?: boolean;
  search?: string;
  expand?: string;
  limit?: number;
  cursor?: string;
}

function buildUsersQuery(query: ListUsersQuery): string {
  const params = new URLSearchParams();
  if (query.roleId) params.set("roleId", query.roleId);
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

export async function getUser(id: string): Promise<ApiUser> {
  return apiRequest<ApiUser>(`/users/${id}`);
}

export async function createUser(body: CreateUserRequest): Promise<ApiUser> {
  return apiRequest<ApiUser>("/users", { method: "POST", body });
}

export async function updateUser(
  id: string,
  body: UpdateUserRequest,
): Promise<ApiUser> {
  return apiRequest<ApiUser>(`/users/${id}`, { method: "PATCH", body });
}

export async function setUserRole(
  id: string,
  roleId: string,
): Promise<ApiUser> {
  return apiRequest<ApiUser>(`/users/${id}/role`, {
    method: "PATCH",
    body: { roleId },
  });
}

export async function assignUserSites(
  id: string,
  siteIds: string[],
): Promise<ApiUser> {
  return apiRequest<ApiUser>(`/users/${id}/sites`, {
    method: "PUT",
    body: { siteIds },
  });
}

export async function resetUserPassword(
  id: string,
  newPassword: string,
): Promise<void> {
  return apiRequest<void>(`/users/${id}/password`, {
    method: "PATCH",
    body: { newPassword },
  });
}

export async function deactivateUser(id: string): Promise<void> {
  return apiRequest<void>(`/users/${id}`, { method: "DELETE" });
}

export async function reactivateUser(id: string): Promise<ApiUser> {
  return updateUser(id, { isActive: true });
}
