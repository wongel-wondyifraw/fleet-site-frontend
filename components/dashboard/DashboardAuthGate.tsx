"use client";

// Client component that gates the entire /dashboard subtree:
// - shows a loading state while we hydrate auth from localStorage
// - redirects unauthenticated users to the login page
// - renders children only when a real user is present
import { Loader2 } from "@/lib/icons";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/lib/auth/AuthContext";
import { getHomePath, isScopedToSites } from "@/lib/auth/useScopedSiteIds";

export function DashboardAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { user, isAuthenticated, isLoading } = useAuth();
  const isGeneralDashboard = pathname === "/dashboard";
  const scopedToSites = isScopedToSites(user);

  // After the initial hydration, kick the user back to the login page when missing.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // router.replace() avoids polluting the browser history.
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, router]);

  // Users without `sites.bypass-scope` who have site assignments are locked
  // to their per-site dashboard. Put this in the app shell so URL entry,
  // stale links, and browser Back all get replaced with /sites/{id}.
  useEffect(() => {
    if (isLoading || !isAuthenticated || !isGeneralDashboard || !scopedToSites) {
      return;
    }
    router.replace(getHomePath(user));
  }, [
    isLoading,
    isAuthenticated,
    isGeneralDashboard,
    scopedToSites,
    user,
    router,
  ]);

  // Block only when we have no cached user to show. If localStorage already
  // hydrated a profile, render the dashboard while /auth/me reconciles.
  if (isLoading && !isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  // Unauthenticated: render nothing while the redirect effect runs.
  if (!isAuthenticated) return null;

  // Do not render the org-wide dashboard while auth/site assignments are still
  // reconciling or while the scoped-user redirect is in flight.
  if (isGeneralDashboard && (isLoading || scopedToSites)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  // Authenticated: pass through the dashboard tree.
  return <>{children}</>;
}
