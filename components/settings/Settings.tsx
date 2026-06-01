"use client";

import dynamic from "next/dynamic";

import { DESKTOP_MEDIA_QUERY, useMediaQuery } from "@/lib/hooks/useMediaQuery";

const MobileSettings = dynamic(
  () =>
    import("@/components/settings/MobileSettings").then((m) => m.MobileSettings),
  { ssr: false, loading: () => null },
);

const DesktopSettings = dynamic(
  () =>
    import("@/components/settings/DesktopSettings").then(
      (m) => m.DesktopSettings,
    ),
  { ssr: false, loading: () => null },
);

export function Settings() {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

  if (isDesktop === null) return null;
  return isDesktop ? <DesktopSettings /> : <MobileSettings />;
}
