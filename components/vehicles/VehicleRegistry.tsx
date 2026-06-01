"use client";

import dynamic from "next/dynamic";

import { DESKTOP_MEDIA_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";

const MobileVehicleRegistry = dynamic(
  () =>
    import("@/components/vehicles/MobileVehicleRegistry").then(
      (m) => m.MobileVehicleRegistry,
    ),
  { ssr: false, loading: () => null },
);

const DesktopVehicleRegistry = dynamic(
  () =>
    import("@/components/vehicles/DesktopVehicleRegistry").then(
      (m) => m.DesktopVehicleRegistry,
    ),
  { ssr: false, loading: () => null },
);

export function VehicleRegistry() {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

  if (isDesktop === null) return null;
  return isDesktop ? <DesktopVehicleRegistry /> : <MobileVehicleRegistry />;
}
