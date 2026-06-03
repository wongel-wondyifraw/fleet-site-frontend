import { ApiError } from "@/lib/api/client";

/**
 * Swallow only "missing permission" failures (HTTP 403) so dashboards can
 * gracefully degrade for users with reduced roles. Auth/expired-token errors
 * (401) and real network errors still surface to the caller.
 */
export function ignoreForbidden<T>(fallback: T) {
  return (err: unknown): T => {
    if (err instanceof ApiError && err.status === 403) return fallback;
    throw err;
  };
}
