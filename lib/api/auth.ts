// Thin auth-related API wrappers around the generic apiRequest helper.
import { apiRequest } from "@/lib/api/client";
import type {
  ApiUser,
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
} from "@/lib/api/types";

// POST /auth/login - no Bearer token sent (this is how we get one).
export async function loginRequest(body: LoginRequest): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body,
    auth: false,
  });
}

// GET /auth/me - returns the currently authenticated user; used to hydrate state.
export async function fetchCurrentUser(signal?: AbortSignal): Promise<ApiUser> {
  return apiRequest<ApiUser>("/auth/me", { signal });
}

// PATCH /auth/me/password - returns 204 No Content on success.
export async function changeOwnPasswordRequest(
  body: ChangePasswordRequest,
): Promise<void> {
  return apiRequest<void>("/auth/me/password", {
    method: "PATCH",
    body,
  });
}
