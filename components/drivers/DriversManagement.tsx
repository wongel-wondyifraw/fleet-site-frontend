"use client";

import dynamic from "next/dynamic";

import { DESKTOP_MEDIA_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";

const MobileDriversManagement = dynamic(
  () =>
    import("@/components/drivers/MobileDriversManagement").then(
      (m) => m.MobileDriversManagement,
    ),
  { loading: () => null },
);

const DesktopDriversManagement = dynamic(
  () =>
    import("@/components/drivers/DesktopDriversManagement").then(
      (m) => m.DesktopDriversManagement,
    ),
  { loading: () => null },
);

// SSRs both responsive shells for fast first paint, then narrows to the
// viewport-matching shell once the browser can evaluate matchMedia.
export function DriversManagement() {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

  if (isDesktop === null) {
    return (
      <>
        <MobileDriversManagement />
        <DesktopDriversManagement />
      </>
    );
  }

  return isDesktop ? <DesktopDriversManagement /> : <MobileDriversManagement />;
}
