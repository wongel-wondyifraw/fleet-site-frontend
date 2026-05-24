// API wrappers for the /users resource on the backend.
import { apiRequest } from "@/lib/api/client";
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

// Optional filters for GET /users; mirrors backend UserQueryDto.
export interface ListUsersQuery {
  role?: UserRole;
  siteId?: string;
  isActive?: boolean;
  search?: string;
}

// GET /users with optional filters appended as querystring.
export async function listUsers(query: ListUsersQuery = {}): Promise<ApiUser[]> {
  // Build a clean querystring, dropping undefined fields so the URL stays tidy.
  const params = new URLSearchParams();
  if (query.role) params.set("role", query.role);
  if (query.siteId) params.set("siteId", query.siteId);
  if (typeof query.isActive === "boolean")
    params.set("isActive", String(query.isActive));
  if (query.search) params.set("search", query.search);
  const qs = params.toString();
  return apiRequest<ApiUser[]>(`/users${qs ? `?${qs}` : ""}`);
}

// POST /users - admin creates a new user; returns the persisted record.
export async function createUser(body: CreateUserRequest): Promise<ApiUser> {
  return apiRequest<ApiUser>("/users", { method: "POST", body });
}

// DELETE /users/:id - soft-delete (isActive=false) on the backend.
export async function deactivateUser(id: string): Promise<void> {
  return apiRequest<void>(`/users/${id}`, { method: "DELETE" });
}
