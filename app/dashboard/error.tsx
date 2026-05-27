"use client";

// Render errors anywhere inside /dashboard/* fall back to a skeleton so the
// user never sees a stack trace / red banner. The skeleton variant is picked
// from the active pathname so it matches the screen the user was on.
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { PageSkeletonForPath } from "@/components/dashboard/PageSkeleton";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname() ?? "";

  // Log in development so the failure isn't completely silent for devs.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("Dashboard segment error:", error);
    }
  }, [error]);

  // Auto-retry the failed segment once the browser regains connectivity.
  // Together with the skeleton below this turns offline blips into a
  // "loading..." experience instead of a hard failure.
  useEffect(() => {
    function onOnline() {
      reset();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [reset]);

  return <PageSkeletonForPath pathname={pathname} />;
}
