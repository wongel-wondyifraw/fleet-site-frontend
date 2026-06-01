"use client";

import dynamic from "next/dynamic";

import { DESKTOP_MEDIA_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";

const MobileVehicleRegistry = dynamic(
  () =>
    import("@/components/vehicles/MobileVehicleRegistry").then(
      (m) => m.MobileVehicleRegistry,
    ),
  { loading: () => null },
);

const DesktopVehicleRegistry = dynamic(
  () =>
    import("@/components/vehicles/DesktopVehicleRegistry").then(
      (m) => m.DesktopVehicleRegistry,
    ),
  { loading: () => null },
);

export function VehicleRegistry() {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

  if (isDesktop === null) {
    return (
      <>
        <MobileVehicleRegistry />
        <DesktopVehicleRegistry />
      </>
    );
  }

  return isDesktop ? <DesktopVehicleRegistry /> : <MobileVehicleRegistry />;
}
