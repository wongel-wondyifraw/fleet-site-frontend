"use client";

// Client component that gates the entire /dashboard subtree:
// - shows a loading state while we hydrate auth from localStorage
// - redirects unauthenticated users to the login page
// - renders children only when a real user is present
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/lib/auth/AuthContext";

export function DashboardAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  // After the initial hydration, kick the user back to the login page when missing.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // router.replace() avoids polluting the browser history.
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, router]);

  // While bootstrapping the auth state, render a centered spinner.
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  // Unauthenticated: render nothing while the redirect effect runs.
  if (!isAuthenticated) return null;

  // Authenticated: pass through the dashboard tree.
  return <>{children}</>;
}
