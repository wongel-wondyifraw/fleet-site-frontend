"use client";

// Route guard for the org-wide /dashboard page. Site-scoped users (those
// assigned to specific sites without `sites.bypass-scope`) should never
// see the global dashboard — if they land here (URL bar, bookmark, an
// old link, etc.) we transparently bounce them to their assigned site.
//
// Admins / bypass users render children as normal.
import { Loader2 } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/lib/auth/AuthContext";
import { isScopedToSites } from "@/lib/auth/useScopedSiteIds";

export function DashboardHomeGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const scoped = isScopedToSites(user);

  useEffect(() => {
    // Wait until auth has hydrated; the parent DashboardAuthGate already
    // handles the unauthenticated case, so here we only need to decide
    // between staying on /dashboard and bouncing to /sites/{id}.
    if (isLoading || !user) return;
    if (scoped) {
      const firstSiteId = user.sites?.[0]?.id;
      if (firstSiteId) {
        router.replace(`/sites/${firstSiteId}`);
      }
    }
  }, [isLoading, user, scoped, router]);

  // While we're hydrating or about to redirect a scoped user, render a
  // lightweight loader instead of the (forbidden) dashboard contents so
  // they never flash before the replace fires.
  if (isLoading || scoped) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
