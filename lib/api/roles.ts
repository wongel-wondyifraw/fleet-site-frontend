import { apiRequest } from "@/lib/api/client";
import type { ApiRole } from "@/lib/api/types";

export interface CreateRoleRequest {
  key: string;
  name: string;
  description?: string;
  permissionSlugs: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permissionSlugs?: string[];
}

export async function listRoles(): Promise<ApiRole[]> {
  return apiRequest<ApiRole[]>("/roles");
}

export async function getRole(id: string): Promise<ApiRole> {
  return apiRequest<ApiRole>(`/roles/${id}`);
}

export async function createRole(body: CreateRoleRequest): Promise<ApiRole> {
  return apiRequest<ApiRole>("/roles", { method: "POST", body });
}

export async function updateRole(
  id: string,
  body: UpdateRoleRequest,
): Promise<ApiRole> {
  return apiRequest<ApiRole>(`/roles/${id}`, { method: "PATCH", body });
}

export async function deleteRole(id: string): Promise<void> {
  return apiRequest<void>(`/roles/${id}`, { method: "DELETE" });
}
