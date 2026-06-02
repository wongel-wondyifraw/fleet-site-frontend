import { apiRequest } from "@/lib/api/client";
import type { ApiPermission } from "@/lib/api/types";

export type PermissionsByCategory = Record<string, ApiPermission[]>;

export async function listPermissions(): Promise<PermissionsByCategory> {
  return apiRequest<PermissionsByCategory>("/permissions");
}
