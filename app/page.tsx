"use client";

// Login page: if the user is already authenticated, redirect to the dashboard.
// Otherwise render the responsive login layouts (mobile + desktop variants).
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { DesktopLogin } from "@/components/login/DesktopLogin";
import { MobileLogin } from "@/components/login/MobileLogin";
import { useAuth } from "@/lib/auth/AuthContext";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  // If we hydrate and find a logged-in user, skip the login form.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, router]);

  // Don't flash the login UI while we're still hydrating the session.
  if (isLoading || isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  // Both variants are rendered; CSS (lg: breakpoint) decides which is visible.
  return (
    <>
      <MobileLogin />
      <DesktopLogin />
    </>
  );
}
