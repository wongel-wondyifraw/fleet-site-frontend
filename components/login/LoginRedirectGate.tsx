"use client";

import { Loader2 } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/lib/auth/AuthContext";
import { getHomePath } from "@/lib/auth/useScopedSiteIds";

/**
 * Client gate for the login page: redirects authenticated users to the
 * dashboard and shows a spinner while auth hydrates from localStorage.
 * Children (mobile + desktop login forms) render only for guests.
 *
 * Site-scoped users (assigned to specific sites with no `sites.bypass-scope`)
 * are sent directly to their first assigned site dashboard so they never see
 * the org-wide /dashboard.
 */
export function LoginRedirectGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(getHomePath(user));
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading || isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
