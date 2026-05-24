// Mirrors backend src/common/enums.ts UserRole - kept in sync manually.
export type UserRole = "ADMIN" | "SITE_MANAGER" | "TIME_KEEPER";

// Ordered list of roles used by select inputs and filter dropdowns.
export const USER_ROLES: UserRole[] = ["ADMIN", "SITE_MANAGER", "TIME_KEEPER"];

// Pretty-print a role code for display (e.g. "SITE_MANAGER" -> "Site Manager").
export function formatRole(role: UserRole | string): string {
  return role
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

// Minimal Site shape used when a User comes back with its sites loaded.
// Extend this only with fields the UI actually needs.
export interface ApiSite {
  id: string;
  code: string;
  name: string;
}

// Mirrors backend User entity (passwordHash is stripped server-side).
export interface ApiUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  sites: ApiSite[];
  createdAt: string;
  updatedAt: string;
}

// Response payload from POST /auth/login.
export interface LoginResponse {
  accessToken: string;
  user: ApiUser;
}

// Body for POST /auth/login.
export interface LoginRequest {
  email: string;
  password: string;
}

// Body for PATCH /auth/me/password.
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Shape returned by Nest's default exception filter for non-200 responses.
// Used by the API client to surface a useful message to the UI.
export interface ApiErrorPayload {
  statusCode: number;
  message: string | string[];
  error?: string;
}
