"use client";

import { Users } from "lucide-react";

import { DriversPanel } from "@/components/drivers/DriversPanel";
import { SettingsSection } from "@/components/settings/SettingsShared";

// Desktop chrome for the Drivers Management page. Mirrors the look of the
// Vehicle Registry desktop view: page header on top, card-shaped panel below.
export function DesktopDriversManagement() {
  return (
    <div className="hidden lg:block">
      <header className="mb-8">
        <p className="text-[11px] font-bold tracking-widest text-dashboard-on-surface-variant uppercase">
          Fleet
        </p>
        <h1 className="font-headline-md text-headline-md text-dashboard-on-background">
          Drivers
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add, edit, and manage drivers and assign them to construction sites.
        </p>
      </header>

      <SettingsSection
        title="Drivers"
        description="Register new drivers, update licensing details, and link them to a site."
        icon={Users}
      >
        <DriversPanel />
      </SettingsSection>
    </div>
  );
}
