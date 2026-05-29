"use client";

// Watches `navigator.onLine` + the browser's online/offline events. In
// production, when the PWA loses connection we swap children for the matching
// skeleton so the user sees a familiar "loading..." shape instead of broken /
// empty data from failed API calls. Reconnecting drops back to the real UI.
// In development we always render children so offline / API issues are visible.
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { PageSkeletonForPath } from "@/components/dashboard/PageSkeleton";

const isProduction = process.env.NODE_ENV === "production";

export function OfflineSkeletonGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  // Start optimistic: render real children during SSR / first paint to avoid
  // a hydration mismatch and a skeleton flash for users who are online.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Offline skeleton swapping is a production PWA feature only. In dev we
    // always render children so API failures and offline blips stay visible.
    if (!isProduction) return;

    // Sync once on mount so SSR's optimistic `true` is corrected if needed.
    setIsOnline(typeof navigator === "undefined" ? true : navigator.onLine);

    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isProduction && !isOnline) {
    return <PageSkeletonForPath pathname={pathname} />;
  }
  return <>{children}</>;
}
