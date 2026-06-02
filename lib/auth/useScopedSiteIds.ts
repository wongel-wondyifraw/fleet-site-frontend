"use client";

import { hasPermission, type ApiUser } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";

const BYPASS_SCOPE = "sites.bypass-scope";

export function useScopedSiteIds(): {
  bypass: boolean;
  siteIds: string[] | null;
  hasAssignments: boolean;
} {
  const { user } = useAuth();
  const bypass = hasPermission(user, BYPASS_SCOPE);
  const siteIds = bypass ? null : (user?.sites ?? []).map((s) => s.id);
  return {
    bypass,
    siteIds,
    hasAssignments: bypass || (user?.sites?.length ?? 0) > 0,
  };
}

export function scopedSiteIdsFromUser(user: ApiUser | null | undefined): {
  bypass: boolean;
  siteIds: string[] | null;
} {
  const bypass = hasPermission(user, BYPASS_SCOPE);
  return {
    bypass,
    siteIds: bypass ? null : (user?.sites ?? []).map((s) => s.id),
  };
}

/**
 * True when the user is restricted to specific site assignments (i.e. lacks
 * the `sites.bypass-scope` permission AND has at least one assigned site).
 * Such users should be funneled to their per-site dashboard instead of the
 * global /dashboard which is intended for org-wide admins.
 */
export function isScopedToSites(user: ApiUser | null | undefined): boolean {
  if (!user) return false;
  if (hasPermission(user, BYPASS_SCOPE)) return false;
  return (user.sites?.length ?? 0) > 0;
}

/**
 * Computes the post-login landing path for a user.
 *
 * - Admins / users with the `sites.bypass-scope` permission land on
 *   `/dashboard` (the org-wide overview).
 * - Users assigned to specific sites (no bypass) are sent directly to
 *   their first assigned site's dashboard at `/sites/{id}` so they only
 *   see the site they are responsible for.
 * - Users without any assignments and without bypass fall back to
 *   `/dashboard` (which renders an "no assignments" empty state).
 */
export function getHomePath(user: ApiUser | null | undefined): string {
  if (isScopedToSites(user)) {
    const firstSiteId = user!.sites![0]!.id;
    return `/sites/${firstSiteId}`;
  }
  return "/dashboard";
}

/**
 * Hook variant of `getHomePath` for use inside React components. Returns
 * the home path for the currently authenticated user.
 */
export function useHomePath(): string {
  const { user } = useAuth();
  return getHomePath(user);
}
