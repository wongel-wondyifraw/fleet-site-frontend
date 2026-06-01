"use client";

import dynamic from "next/dynamic";

import { DESKTOP_MEDIA_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";

const MobileTripManagement = dynamic(
  () =>
    import("@/components/trips/MobileTripManagement").then(
      (m) => m.MobileTripManagement,
    ),
  { ssr: false, loading: () => null },
);

const DesktopTripManagement = dynamic(
  () =>
    import("@/components/trips/DesktopTripManagement").then(
      (m) => m.DesktopTripManagement,
    ),
  { ssr: false, loading: () => null },
);

export function TripManagement() {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

  if (isDesktop === null) return null;
  return isDesktop ? <DesktopTripManagement /> : <MobileTripManagement />;
}
