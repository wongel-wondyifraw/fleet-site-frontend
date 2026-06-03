"use client";

import { hasPermission, type ApiUser } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";

export const BYPASS_SCOPE = "sites.bypass-scope";

/** True when the user may view and manage data across all sites. */
export function hasBypassScope(user: ApiUser | null | undefined): boolean {
  return hasPermission(user, BYPASS_SCOPE);
}

export function useScopedSiteIds(): {
  bypass: boolean;
  siteIds: string[] | null;
  hasAssignments: boolean;
} {
  const { user } = useAuth();
  const bypass = hasBypassScope(user);
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
  const bypass = hasBypassScope(user);
  return {
    bypass,
    siteIds: bypass ? null : (user?.sites ?? []).map((s) => s.id),
  };
}

/**
 * True when the user is restricted to specific site assignments (lacks
 * `sites.bypass-scope` and has at least one assigned site). Such users are
 * funneled to their per-site dashboard instead of the org-wide /dashboard.
 */
export function isScopedToSites(user: ApiUser | null | undefined): boolean {
  if (!user) return false;
  if (hasBypassScope(user)) return false;
  return (user.sites?.length ?? 0) > 0;
}

/**
 * True when the user may access the org-wide /dashboard route.
 * Bypass holders see all sites; unassigned users see the empty-state dashboard.
 */
export function canViewGeneralDashboard(
  user: ApiUser | null | undefined,
): boolean {
  if (!user) return false;
  if (hasBypassScope(user)) return true;
  return (user.sites?.length ?? 0) === 0;
}

/**
 * Computes the post-login landing path for a user.
 *
 * - Users with `sites.bypass-scope` land on `/dashboard` (org-wide overview).
 * - Users assigned to specific sites (no bypass) go to `/sites/{id}`.
 * - Users without assignments fall back to `/dashboard` (empty state).
 */
export function getHomePath(user: ApiUser | null | undefined): string {
  if (isScopedToSites(user)) {
    const firstSiteId = user!.sites![0]!.id;
    return `/sites/${firstSiteId}`;
  }
  return "/dashboard";
}

/**
 * Hook variant of `getHomePath` for use inside React components.
 */
export function useHomePath(): string {
  const { user } = useAuth();
  return getHomePath(user);
}
