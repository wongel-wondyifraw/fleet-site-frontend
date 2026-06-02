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
