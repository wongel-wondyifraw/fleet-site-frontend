"use client";

import dynamic from "next/dynamic";

import { DESKTOP_MEDIA_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";

const MobileDriversManagement = dynamic(
  () =>
    import("@/components/drivers/MobileDriversManagement").then(
      (m) => m.MobileDriversManagement,
    ),
  { ssr: false, loading: () => null },
);

const DesktopDriversManagement = dynamic(
  () =>
    import("@/components/drivers/DesktopDriversManagement").then(
      (m) => m.DesktopDriversManagement,
    ),
  { ssr: false, loading: () => null },
);

// Loads only the viewport-matching management shell so mobile users
// never download the desktop DriversPanel chunk (and vice versa).
export function DriversManagement() {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

  if (isDesktop === null) return null;
  return isDesktop ? <DesktopDriversManagement /> : <MobileDriversManagement />;
}
