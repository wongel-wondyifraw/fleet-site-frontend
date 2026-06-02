"use client";

// Lightweight permission gates for UI actions.
//
// Rather than letting users click "Add Driver" / "Edit" / "Delete" only to
// be slapped with a 403 from the backend, every action surface in the app
// should hide itself when the current user doesn't hold the required slug.
//
// Two flavours are exported:
//   - <Can permission="..."> ... </Can>   declarative gate around JSX.
//   - useCan("...") / useCan(["a", "b"]) hook for branching in code paths
//     where rendering a wrapper is awkward (e.g. inside a prop list).
import type { ReactNode } from "react";

import { hasPermission, type ApiUser } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthContext";

// Internal: evaluate a permission rule against a user. Exported so non-React
// callers (e.g. memo selectors) can share the same semantics.
export function canDo(
  user: ApiUser | null | undefined,
  rule: {
    permission?: string;
    anyOf?: readonly string[];
    allOf?: readonly string[];
  },
): boolean {
  if (rule.permission && !hasPermission(user, rule.permission)) return false;
  if (rule.allOf && !rule.allOf.every((s) => hasPermission(user, s))) {
    return false;
  }
  if (rule.anyOf && !rule.anyOf.some((s) => hasPermission(user, s))) {
    return false;
  }
  // If no rule was specified at all, default to "allowed". This keeps the
  // component a no-op when callers forget to pass props.
  return true;
}

interface CanProps {
  /** A single required permission slug. */
  permission?: string;
  /** Allowed if the user holds at least one of these slugs. */
  anyOf?: readonly string[];
  /** Allowed only if the user holds every one of these slugs. */
  allOf?: readonly string[];
  /** Rendered when allowed. */
  children: ReactNode;
  /** Optional fallback for denied users (rare — usually we just hide). */
  fallback?: ReactNode;
}

/**
 * Render `children` only when the current user satisfies the permission
 * rule. Pass any of `permission` / `anyOf` / `allOf` (combined with AND).
 *
 * Example:
 *   <Can permission="drivers.create">
 *     <Button>Add Driver</Button>
 *   </Can>
 */
export function Can({
  permission,
  anyOf,
  allOf,
  children,
  fallback = null,
}: CanProps): ReactNode {
  const { user } = useAuth();
  return canDo(user, { permission, anyOf, allOf }) ? children : fallback;
}

/**
 * Hook variant of <Can>. Returns a boolean so callers can branch in JSX,
 * disable buttons, gate effects, or compose with other booleans.
 *
 * Pass a string for a single permission, or an array for "all of".
 *
 *   const canCreateDriver = useCan("drivers.create");
 *   const canManageRoles  = useCan(["roles.read", "roles.update"]);
 */
export function useCan(permission: string | readonly string[]): boolean {
  const { user } = useAuth();
  if (Array.isArray(permission)) {
    return canDo(user, { allOf: permission });
  }
  return canDo(user, { permission: permission as string });
}
