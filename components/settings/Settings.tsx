import { DesktopSettings } from "@/components/settings/DesktopSettings";
import { MobileSettings } from "@/components/settings/MobileSettings";

export function Settings() {
  return (
    <>
      <MobileSettings />
      <DesktopSettings />
    </>
  );
}
