"use client";

import { Loader2 } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/lib/auth/AuthContext";

/**
 * Client gate for the login page: redirects authenticated users to the
 * dashboard and shows a spinner while auth hydrates from localStorage.
 * Children (mobile + desktop login forms) render only for guests.
 */
export function LoginRedirectGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
